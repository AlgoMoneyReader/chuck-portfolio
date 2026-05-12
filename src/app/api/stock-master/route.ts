/**
 * /api/stock-master
 *
 * 전체 상장 종목 목록 반환 (regular + ETF)
 *
 * 우선순위:
 *  1. KRX 공개 API → 전 종목 2,000개+ (인증 불필요)
 *  2. KIS API 페이지네이션 → KRX 실패 시 fallback (KIS_APP_KEY 필요)
 *  3. 정적 STOCK_MASTER_FILTERED → 둘 다 실패 시 최후 fallback
 *
 * 마스터 버전 태그: 종목 코드 변경 시 올려 브라우저 캐시 즉시 무효화
 */

import { NextResponse } from "next/server";
import { STOCK_MASTER_FILTERED } from "@/lib/stockMaster";
import { getKrxMaster } from "@/lib/fetchKrxMaster";

export const dynamic = "force-dynamic";

const MASTER_VERSION = "2026.05.12.2";

// ─── KIS API 토큰 캐시 (KIS fallback용) ──────────────────────────────────────
let kisToken: { value: string; expiresAt: number } | null = null;

async function getKisToken(): Promise<string | null> {
  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) return null;
  const now = Date.now();
  if (kisToken && kisToken.expiresAt > now + 60_000) return kisToken.value;
  try {
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
    const data = await res.json();
    kisToken = {
      value: data.access_token,
      expiresAt: now + (data.expires_in ?? 86400) * 1000,
    };
    return kisToken.value;
  } catch {
    return null;
  }
}

/**
 * KIS API 페이지네이션으로 KOSPI/KOSDAQ 전 종목 조회
 *
 * tr_id FHKST03010100 (KOSPI) / FHKST03020100 (KOSDAQ)
 * ctx_area_fk / ctx_area_nk 를 다음 페이지 키로 사용.
 * 빈 ctx 응답이 오면 순회 완료.
 */
async function fetchKisMarket(
  token: string,
  market: "J" | "Q"
): Promise<{ code: string; name: string; market: "KS" | "KQ" }[]> {
  const trId = market === "J" ? "FHKST03010100" : "FHKST03020100";
  const resultMarket: "KS" | "KQ" = market === "J" ? "KS" : "KQ";
  const stocks: { code: string; name: string; market: "KS" | "KQ" }[] = [];

  let ctxFk = "";
  let ctxNk = "";
  let page = 0;
  const MAX_PAGES = 50; // 안전 장치

  while (page < MAX_PAGES) {
    page++;
    try {
      const params = new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: market,
        FID_COND_SCR_DIV_CODE: market === "J" ? "20171" : "20271",
        FID_INPUT_ISCD: "0000",          // 전체 종목
        FID_DIV_CLS_CODE: "0",
        FID_BLNG_CLS_CODE: "0",
        FID_TRGT_CLS_CODE: "111111111",
        FID_TRGT_EXLS_CLS_CODE: "0000000",
        FID_INPUT_PRICE_1: "0",
        FID_INPUT_PRICE_2: "999999999",
        FID_VOL_CNT: "0",
        FID_INPUT_DATE_1: "",
      });

      const res = await fetch(
        `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/volume-rank?${params}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            appkey: process.env.KIS_APP_KEY!,
            appsecret: process.env.KIS_APP_SECRET!,
            tr_id: trId,
            custtype: "P",
            // 페이지 연속 키
            "tr_cont": page === 1 ? "N" : "Y",
            ctx_area_fk100: ctxFk,
            ctx_area_nk100: ctxNk,
          } as Record<string, string>,
          cache: "no-store",
        }
      );

      if (!res.ok) break;
      const data = await res.json();

      const rows: { stck_shrn_iscd?: string; hts_kor_isnm?: string }[] =
        data.output ?? [];

      if (rows.length === 0) break;

      for (const r of rows) {
        const code = (r.stck_shrn_iscd ?? "").trim();
        const name = (r.hts_kor_isnm ?? "").trim();
        if (code && name && /^\d{6}$/.test(code)) {
          stocks.push({ code, name, market: resultMarket });
        }
      }

      // 다음 페이지 키
      ctxFk = (data.ctx_area_fk100 ?? "").trim();
      ctxNk = (data.ctx_area_nk100 ?? "").trim();

      console.log(
        `[kis-master] ${resultMarket} page=${page} rows=${rows.length} next_fk="${ctxFk.slice(0, 8)}…"`
      );

      // 마지막 페이지
      if (!ctxFk && !ctxNk) break;

      // Rate limit 방지 — 100ms 딜레이
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      console.error(`[kis-master] page ${page} error:`, err);
      break;
    }
  }

  console.log(
    `[kis-master] ${resultMarket} 완료: ${stocks.length}개 (${page}페이지)`
  );
  return stocks;
}

export async function GET() {
  // ── 1. KRX 공개 API 시도 ────────────────────────────────────────────────────
  try {
    const krxStocks = await getKrxMaster(["regular", "etf"]);

    if (krxStocks.length > 100) {
      console.log(
        `[stock-master] KRX 성공 → ${krxStocks.length}개 반환`
      );
      return NextResponse.json(
        { version: MASTER_VERSION, stocks: krxStocks, source: "krx" },
        {
          headers: {
            "Cache-Control":
              "public, max-age=3600, stale-while-revalidate=300",
            "X-Master-Version": MASTER_VERSION,
            "X-Stock-Count": String(krxStocks.length),
          },
        }
      );
    }
  } catch (err) {
    console.error("[stock-master] KRX 실패:", err);
  }

  // ── 2. KIS API 페이지네이션 fallback ────────────────────────────────────────
  const token = await getKisToken();
  if (token) {
    try {
      const [kospi, kosdaq] = await Promise.all([
        fetchKisMarket(token, "J"),
        fetchKisMarket(token, "Q"),
      ]);
      const all = [...kospi, ...kosdaq];

      console.log(
        `[stock-master] KIS 성공 → KOSPI ${kospi.length} + KOSDAQ ${kosdaq.length} = 전체 ${all.length}개`
      );

      const stocks = all.map((s) => ({
        ...s,
        type: "regular" as const,
      }));

      return NextResponse.json(
        { version: MASTER_VERSION, stocks, source: "kis" },
        {
          headers: {
            "Cache-Control":
              "public, max-age=3600, stale-while-revalidate=300",
            "X-Master-Version": MASTER_VERSION,
            "X-Stock-Count": String(stocks.length),
          },
        }
      );
    } catch (err) {
      console.error("[stock-master] KIS fallback 실패:", err);
    }
  }

  // ── 3. 정적 마스터 최후 fallback ────────────────────────────────────────────
  console.warn(
    `[stock-master] 정적 fallback 사용 — ${STOCK_MASTER_FILTERED.length}개`
  );
  return NextResponse.json(
    {
      version: MASTER_VERSION,
      stocks: STOCK_MASTER_FILTERED,
      source: "static",
    },
    {
      headers: {
        "Cache-Control":
          "public, max-age=60, stale-while-revalidate=30, must-revalidate",
        "X-Master-Version": MASTER_VERSION,
        "X-Stock-Count": String(STOCK_MASTER_FILTERED.length),
      },
    }
  );
}
