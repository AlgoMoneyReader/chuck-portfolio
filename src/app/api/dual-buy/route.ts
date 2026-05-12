/**
 * GET /api/dual-buy
 *
 * 외국인 + 기관 동반 순매수 TOP 10 (쌍끌이)
 *
 * 종목 풀: KIS 마스터 전종목 (KOSPI + KOSDAQ, 하드코딩 배열 없음)
 * KIS inquire-investor API 를 배치 호출 → frgn > 0 && orgn > 0 종목 추출
 *
 * ★ 토큰: fetchKisMaster.ts 의 getKisToken() 공유 — 별도 발급 금지
 *   (KIS 1분 1회 제한: 두 모듈이 각자 토큰 발급 시 403 rate-limit 폭발)
 */

import { NextResponse } from "next/server";
import { getKisMaster, getKisToken } from "@/lib/fetchKisMaster";

export const dynamic = "force-dynamic";

export interface DualBuyItem {
  code: string;
  name: string;
  market: "KS" | "KQ";
  price: number;
  changePct: number;
  foreign: number;
  institution: number;
  combined: number;
}

interface KISRow {
  stck_clpr: string;
  prdy_vrss: string;
  prdy_vrss_sign: string;
  frgn_ntby_tr_pbmn: string;
  orgn_ntby_tr_pbmn: string;
}

function toUk(s: string): number {
  const n = parseInt((s ?? "").replace(/,/g, "") || "0", 10);
  return isNaN(n) ? 0 : Math.round(n / 100);
}

async function fetchInvestor(
  code: string,
  token: string,
  mktDiv: "J" | "Q"
): Promise<{ code: string; price: number; changePct: number; frgn: number; orgn: number } | null> {
  try {
    const res = await fetch(
      `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor` +
      `?FID_COND_MRKT_DIV_CODE=${mktDiv}&FID_INPUT_ISCD=${code}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          appkey: process.env.KIS_APP_KEY!,
          appsecret: process.env.KIS_APP_SECRET!,
          tr_id: "FHKST01010900",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) {
      let errBody = "";
      try { errBody = await res.text(); } catch { /* ignore */ }
      console.error(`🚨 [KIS API ERROR] inquire-investor ${code} HTTP ${res.status}`, errBody.slice(0, 200));
      return null;
    }
    const data = await res.json();
    // KIS 비즈니스 오류 로깅
    if (String(data.rt_cd ?? "0") !== "0") {
      console.error(`🚨 [KIS API ERROR] inquire-investor ${code} rt_cd=${data.rt_cd} msg="${data.msg1 ?? ""}"`);
      return null;
    }
    const rows: KISRow[] = data.output ?? [];
    const r = rows.find((x) => x.frgn_ntby_tr_pbmn !== "");
    if (!r) return null;

    const price = parseInt(r.stck_clpr, 10) || 0;
    const vrss = parseInt(r.prdy_vrss, 10) || 0;
    const sign = r.prdy_vrss_sign;
    const signed = ["1","2"].includes(sign) ? vrss : ["4","5"].includes(sign) ? -vrss : 0;
    const prev = price - signed;
    const changePct = prev > 0 ? parseFloat(((signed / prev) * 100).toFixed(2)) : 0;

    return { code, price, changePct, frgn: toUk(r.frgn_ntby_tr_pbmn), orgn: toUk(r.orgn_ntby_tr_pbmn) };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // ★ fetchKisMaster 공유 토큰 사용 — 별도 발급 없음 (1분 1회 제한)
    console.log("🎟️  [dual-buy] Token: using shared getKisToken()");
    const token = await getKisToken();
    console.log("🎟️  [dual-buy] Token: OK");

    // KIS 마스터 전종목 로드 (캐시 활용 — 토큰 재발급 없음)
    const master = await getKisMaster(["regular"]);
    const ks = master.filter((s) => s.market === "KS");
    const kq = master.filter((s) => s.market === "KQ");

    console.log(
      `[dual-buy] 스캔 대상: KOSPI ${ks.length}개 + KOSDAQ ${kq.length}개 = 합계 ${master.length}개`
    );

    // BATCH=3, delay=300ms — KIS 초당 거래건수 제한(EGW00201) 방지
    const BATCH = 3;
    const DELAY_MS = 300;
    const results: Awaited<ReturnType<typeof fetchInvestor>>[] = [];

    for (let i = 0; i < ks.length; i += BATCH) {
      const r = await Promise.all(ks.slice(i, i + BATCH).map((s) => fetchInvestor(s.code, token, "J")));
      results.push(...r);
      if (i + BATCH < ks.length) await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    for (let i = 0; i < kq.length; i += BATCH) {
      const r = await Promise.all(kq.slice(i, i + BATCH).map((s) => fetchInvestor(s.code, token, "Q")));
      results.push(...r);
      if (i + BATCH < kq.length) await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    const nameMap = new Map(master.map((s) => [s.code, s.name]));
    const kqCodes = new Set(kq.map((s) => s.code));

    const valid = results.filter(Boolean) as NonNullable<(typeof results)[0]>[];
    const dualBuy: DualBuyItem[] = valid
      .filter((r) => r.frgn > 0 && r.orgn > 0)
      .map((r) => ({
        code: r.code,
        name: nameMap.get(r.code) ?? r.code,
        market: (kqCodes.has(r.code) ? "KQ" : "KS") as "KS" | "KQ",
        price: r.price,
        changePct: r.changePct,
        foreign: r.frgn,
        institution: r.orgn,
        combined: r.frgn + r.orgn,
      }))
      .sort((a, b) => b.combined - a.combined)
      .slice(0, 10);

    console.log(`[dual-buy] 쌍끌이 포착: ${dualBuy.length}개`);

    return NextResponse.json(
      { stocks: dualBuy, timestamp: new Date().toISOString(), threshold: 0 },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("🚨 [KIS API ERROR] [dual-buy] GET() 최상위 오류:", String(err));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
