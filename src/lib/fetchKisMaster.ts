/**
 * KIS(한국투자증권) 오픈 API — 토큰 관리
 *
 * ── 역할 변경 (2026-05-12) ────────────────────────────────────────────────────
 * 이전: KIS API 전종목 페이징 수집 → EGW00201 rate-limit 폭발
 * 현재: getKisToken() 만 제공 — 토큰 인메모리 캐시 공유
 *
 * 전종목 마스터는 src/data/stock_master.json (KRX KIND 정적 파일) 사용
 * dual-buy는 거래량순위 API 직접 호출 (최소 API 쿼터 사용)
 *
 * ── 토큰 rate limit ───────────────────────────────────────────────────────────
 * KIS는 1분에 1회만 토큰 발급 허용 (EGW00133)
 * → _tok 캐시로 공유 — dual-buy 등 여러 모듈이 이 함수 하나만 호출
 */

import { unstable_cache, revalidateTag } from "next/cache";

// ── KIS OAuth 토큰 캐시 ───────────────────────────────────────────────────────
// 인스턴스 메모리 캐시 + Vercel Data Cache(인스턴스 간 공유). 1분 1회 발급 제한(EGW00133) 회피
let _tok: { value: string; exp: number } | null = null;

async function issueToken(): Promise<{ value: string; exp: number }> {
  const res = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) {
    throw new Error(`KIS token ${data.error_code ?? res.status} ${data.error_description ?? ""}`.trim());
  }
  return { value: data.access_token, exp: Date.now() + (data.expires_in ?? 86400) * 1000 };
}

const sharedToken = unstable_cache(issueToken, ["kis-token-v1"], { revalidate: 6 * 3600, tags: ["kis-token"] });

export async function getKisToken(): Promise<string> {
  if (_tok && _tok.exp > Date.now() + 60_000) return _tok.value;
  let t: { value: string; exp: number };
  try {
    t = await sharedToken();
  } catch (e) {
    // 다른 인스턴스가 방금 발급했으면 잠시 뒤 공유 캐시에 들어와 있다
    if (!String(e).includes("EGW00133")) throw e;
    await new Promise(r => setTimeout(r, 2000));
    t = await sharedToken();
  }
  if (t.exp <= Date.now() + 60_000) {
    revalidateTag("kis-token");
    t = await issueToken();
  }
  _tok = t;
  return t.value;
}

export function invalidateKisToken() {
  _tok = null;
  revalidateTag("kis-token");
}
