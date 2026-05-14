/**
 * GET /api/dual-buy
 *
 * 외국인 + 기관 동반 순매수 TOP 10 (쌍끌이)
 *
 * ── 스캔 풀 전략 ─────────────────────────────────────────────────────────────
 * 전종목 2,600개 실시간 스캔 폐기 → KIS 거래량순위 TOP 결과만 스캔
 *
 * 1. KIS 거래량순위(FHPST01710000, KOSPI) → 그 날 가장 많이 거래된 종목들
 *    - 장중: tr_cont F/M 연속조회로 수십 페이지 → 최대 MAX_SCAN개
 *    - 장마감: tr_cont N → 1페이지 30개
 * 2. 위 종목들에 대해서만 inquire-investor 호출 (BATCH=3, 300ms 간격)
 * 3. frgn > 0 && orgn > 0 → 외국인·기관 동반 순매수 top 10
 *
 * KIS API 쿼터 절약:
 *   - getKisMaster() 대량 페이징 호출 완전 제거
 *   - 토큰: getKisToken() 단일 공유 (EGW00133 방지)
 *   - inquire-investor: BATCH=3, 300ms 간격 (EGW00201 방지)
 */

import { NextResponse } from "next/server";
import { getKisToken } from "@/lib/fetchKisMaster";

export const dynamic = "force-dynamic";

// 거래량 순위에서 가져올 최대 종목 수 (장중 연속 조회 시)
const MAX_SCAN = 90; // 3페이지 × 30개

// ── 거래량 순위 TOP 종목 수집 ─────────────────────────────────────────────────
interface ScanStock { code: string; name: string; market: "KS" | "KQ" }

async function getVolumeRankPool(token: string): Promise<ScanStock[]> {
  const stocks: ScanStock[] = [];
  const seen = new Set<string>();

  let ctxFk = "", ctxNk = "", trCont = "N", page = 0;

  while (stocks.length < MAX_SCAN && page < 10) {
    page++;
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",  // KOSPI — KOSDAQ("Q") INVALID
      FID_COND_SCR_DIV_CODE: "20171",
      FID_INPUT_ISCD: "0000",
      FID_DIV_CLS_CODE: "0",
      FID_BLNG_CLS_CODE: "0",
      FID_TRGT_CLS_CODE: "111111111",
      FID_TRGT_EXLS_CLS_CODE: "0000000",
      FID_INPUT_PRICE_1: "0",
      FID_INPUT_PRICE_2: "999999999",
      FID_VOL_CNT: "0",
      FID_INPUT_DATE_1: "",
    });

    try {
      const res = await fetch(
        `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/volume-rank?${params}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            appkey: process.env.KIS_APP_KEY!,
            appsecret: process.env.KIS_APP_SECRET!,
            tr_id: "FHPST01710000",
            custtype: "P",
            tr_cont: trCont,
            ctx_area_fk100: ctxFk,
            ctx_area_nk100: ctxNk,
          } as Record<string, string>,
          cache: "no-store",
        }
      );

      if (!res.ok) {
        console.error(`🚨 [KIS] volume-rank p${page} HTTP ${res.status}`);
        break;
      }

      const body = await res.json();
      if (String(body.rt_cd ?? "0") !== "0") {
        console.warn(`[dual-buy] volume-rank rt_cd=${body.rt_cd} msg="${body.msg1}" → 스캔 중단`);
        break;
      }

      const rows: { mksc_shrn_iscd?: string; stck_shrn_iscd?: string; hts_kor_isnm?: string }[] =
        body.output ?? [];

      for (const r of rows) {
        const code = (r.mksc_shrn_iscd ?? r.stck_shrn_iscd ?? "").trim();
        const name = (r.hts_kor_isnm ?? "").trim();
        if (!code || !name || !/^\d{6}$/.test(code) || seen.has(code)) continue;
        seen.add(code);
        stocks.push({ code, name, market: "KS" });
      }

      const respTrCont = (res.headers.get("tr_cont") ?? "").trim();
      console.log(`[dual-buy] volume-rank p${page} rows=${rows.length} total=${stocks.length} tr_cont="${respTrCont}"`);

      const hasMore = respTrCont === "F" || respTrCont === "M";
      if (!hasMore) break;

      ctxFk = (body.ctx_area_fk100 ?? "").trim();
      ctxNk = (body.ctx_area_nk100 ?? "").trim();
      if (!ctxFk && !ctxNk) break;
      trCont = "Y";
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`🚨 [KIS] volume-rank p${page} 오류:`, String(err));
      break;
    }
  }

  console.log(`[dual-buy] 스캔 풀: ${stocks.length}개 (거래량 상위)`);
  return stocks;
}

// ── 투자자 정보 조회 ──────────────────────────────────────────────────────────
interface KISRow {
  stck_clpr: string; prdy_vrss: string; prdy_vrss_sign: string;
  frgn_ntby_tr_pbmn: string; orgn_ntby_tr_pbmn: string;
}

function toUk(s: string): number {
  const n = parseInt((s ?? "").replace(/,/g, "") || "0", 10);
  return isNaN(n) ? 0 : Math.round(n / 100);
}

async function fetchInvestor(
  stock: ScanStock,
  token: string,
): Promise<{ code: string; name: string; market: "KS"|"KQ"; price: number; changePct: number; frgn: number; orgn: number } | null> {
  try {
    const res = await fetch(
      `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor` +
      `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${stock.code}`,
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
      console.error(`🚨 [KIS] inquire-investor ${stock.code} HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (String(data.rt_cd ?? "0") !== "0") {
      console.error(`🚨 [KIS] inquire-investor ${stock.code} rt_cd=${data.rt_cd} msg="${data.msg1}"`);
      return null;
    }

    const rows: KISRow[] = data.output ?? [];
    const r = rows.find((x) => x.frgn_ntby_tr_pbmn !== "");
    if (!r) return null;

    const price = parseInt(r.stck_clpr, 10) || 0;
    const vrss  = parseInt(r.prdy_vrss, 10) || 0;
    const sign  = r.prdy_vrss_sign;
    const signed = ["1","2"].includes(sign) ? vrss : ["4","5"].includes(sign) ? -vrss : 0;
    const prev = price - signed;
    const changePct = prev > 0 ? parseFloat(((signed / prev) * 100).toFixed(2)) : 0;

    return {
      code: stock.code, name: stock.name, market: stock.market,
      price, changePct,
      frgn: toUk(r.frgn_ntby_tr_pbmn),
      orgn: toUk(r.orgn_ntby_tr_pbmn),
    };
  } catch {
    return null;
  }
}

// ── 메인 핸들러 ──────────────────────────────────────────────────────────────
export interface DualBuyItem {
  code: string; name: string; market: "KS" | "KQ";
  price: number; changePct: number;
  foreign: number; institution: number; combined: number;
}

export async function GET() {
  try {
    console.log("🎟️  [dual-buy] Token: using shared getKisToken()");
    const token = await getKisToken();
    console.log("🎟️  [dual-buy] Token: OK");

    // 1. 거래량 순위 TOP 종목을 스캔 풀로 사용
    const pool = await getVolumeRankPool(token);
    if (pool.length === 0) {
      console.warn("[dual-buy] 스캔 풀 0개 — 빈 결과 반환");
      return NextResponse.json(
        { stocks: [], timestamp: new Date().toISOString(), threshold: 0 },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // 2. inquire-investor 배치 호출 (BATCH=3, 300ms 간격)
    const BATCH = 3;
    const DELAY_MS = 300;
    const results: Awaited<ReturnType<typeof fetchInvestor>>[] = [];

    for (let i = 0; i < pool.length; i += BATCH) {
      const batch = pool.slice(i, i + BATCH);
      const r = await Promise.all(batch.map((s) => fetchInvestor(s, token)));
      results.push(...r);
      if (i + BATCH < pool.length) await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    // 3. 외국인·기관 동반 순매수 필터 → top 10
    const dualBuy: DualBuyItem[] = results
      .filter((r): r is NonNullable<typeof r> => r !== null && r.frgn > 0 && r.orgn > 0)
      .map((r) => ({
        code: r.code, name: r.name, market: r.market,
        price: r.price, changePct: r.changePct,
        foreign: r.frgn, institution: r.orgn,
        combined: r.frgn + r.orgn,
      }))
      .sort((a, b) => b.combined - a.combined)
      .slice(0, 10);

    // 4. Yahoo Finance spark API로 실시간 주가 덮어쓰기
    //    (KIS inquire-investor의 stck_clpr는 전일 종가 → 장중에 틀림)
    if (dualBuy.length > 0) {
      try {
        const symbols = dualBuy.map((s) => `${s.code}.${s.market}`).join(",");
        const yfRes = await fetch(
          `https://query2.finance.yahoo.com/v7/finance/spark` +
            `?symbols=${encodeURIComponent(symbols)}&range=1d&interval=5m`,
          { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
        );
        if (yfRes.ok) {
          const yfJson = await yfRes.json();
          const yfMap: Record<string, { price: number; changePct: number }> = {};
          for (const item of yfJson?.spark?.result ?? []) {
            const meta = item?.response?.[0]?.meta ?? {};
            const price: number = meta.regularMarketPrice ?? 0;
            const prev: number  = meta.chartPreviousClose ?? meta.previousClose ?? price;
            if (price > 0) {
              yfMap[item.symbol] = {
                price,
                changePct: prev > 0 ? parseFloat(((price - prev) / prev * 100).toFixed(2)) : 0,
              };
            }
          }
          for (const s of dualBuy) {
            const yf = yfMap[`${s.code}.${s.market}`];
            if (yf) { s.price = yf.price; s.changePct = yf.changePct; }
          }
          console.log(`[dual-buy] YF 실시간 주가 적용: ${Object.keys(yfMap).length}개`);
        }
      } catch (e) {
        console.warn("[dual-buy] YF 주가 조회 실패 (KIS 종가 사용):", String(e));
      }
    }

    console.log(`[dual-buy] 쌍끌이 포착: ${dualBuy.length}개 / 스캔 ${results.length}개`);

    return NextResponse.json(
      { stocks: dualBuy, timestamp: new Date().toISOString(), threshold: 0 },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("🚨 [KIS API ERROR] [dual-buy] GET() 최상위 오류:", String(err));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
