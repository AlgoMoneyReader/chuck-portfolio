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

// ── KIS OAuth 토큰 캐시 ───────────────────────────────────────────────────────
let _tok: { value: string; exp: number } | null = null;

/**
 * KIS access_token 반환 (인메모리 캐시, 만료 1분 전 자동 갱신)
 * 여러 API 모듈이 공유 — 절대 각 모듈에서 별도 발급하지 말 것
 */
export async function getKisToken(): Promise<string> {
  const now = Date.now();

  // 환경변수 점검
  console.log(
    "🔑 KIS Key Load Status:",
    process.env.KIS_APP_KEY    ? `Loaded (${process.env.KIS_APP_KEY.slice(0, 6)}…)`    : "❌ Missing",
    "|",
    process.env.KIS_APP_SECRET ? `Loaded (${process.env.KIS_APP_SECRET.slice(0, 6)}…)` : "❌ Missing"
  );

  if (_tok && _tok.exp > now + 60_000) {
    console.log("🎟️  Token Status: Valid (cached, exp in", Math.round((_tok.exp - now) / 1000), "s)");
    return _tok.value;
  }

  console.log("🎟️  Token Status: Fetching new token…");

  const res = await fetch(
    "https://openapi.koreainvestment.com:9443/oauth2/tokenP",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: process.env.KIS_APP_KEY,
        appsecret: process.env.KIS_APP_SECRET,
      }),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    console.error(`🚨 [KIS API ERROR] 토큰 발급 실패: HTTP ${res.status}`, body);
    throw new Error(`[kis] 토큰 발급 실패: HTTP ${res.status} — ${body}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    console.error("🚨 [KIS API ERROR] 토큰 응답에 access_token 없음:", JSON.stringify(data));
    throw new Error("[kis] access_token 없음");
  }

  console.log("🎟️  Token Status: Valid (new, exp in", data.expires_in ?? 86400, "s)");
  _tok = { value: data.access_token, exp: now + (data.expires_in ?? 86400) * 1000 };
  return _tok.value;
}

/** 토큰 캐시 즉시 무효화 */
export function invalidateKisToken() {
  _tok = null;
  console.log("[kis] 토큰 캐시 무효화됨");
}
