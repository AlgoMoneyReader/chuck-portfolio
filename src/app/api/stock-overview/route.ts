import { NextResponse } from "next/server";
import { kisGet, num, kstYmd } from "@/lib/kis";
import master from "@/data/stock_master.json";

const MASTER = new Map((master as { stocks: { code: string; name: string; market: string }[] }).stocks.map(s => [s.code, s]));

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

const Q = "/uapi/domestic-stock/v1/quotations/";
const F = "/uapi/domestic-stock/v1/finance/";

type Row = Record<string, string>;
const rows = (j: { output?: unknown; output1?: unknown; output2?: unknown }, key: "output" | "output1" | "output2" = "output"): Row[] => {
  const v = j[key];
  return Array.isArray(v) ? (v as Row[]) : v ? [v as Row] : [];
};

function opinionClass(s: string): "buy" | "hold" | "sell" | null {
  if (/매도|sell|underperform|reduce|underweight/i.test(s)) return "sell";
  if (/중립|보유|hold|neutral|market\s*perform|equal/i.test(s)) return "hold";
  if (/매수|buy|outperform|overweight|accumulate/i.test(s)) return "buy";
  return null;
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const code = sp.get("code") ?? "";
  const quoteOnly = sp.get("quote") === "1"; // 장중 폴링용: 시세만
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "종목코드 6자리가 필요합니다" }, { status: 400 });

  const errors: string[] = [];
  const safe = async <T,>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    try { return await fn(); } catch (e) { errors.push(`${name}: ${String(e).slice(0, 80)}`); return null; }
  };

  const [price, opinion, ratio, income, short] = await Promise.all([
    safe("시세", () => kisGet(Q + "inquire-price", "FHKST01010100", { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code })),
    quoteOnly ? null : safe("투자의견", () => kisGet(Q + "invest-opinion", "FHKST663300C0", {
      FID_COND_MRKT_DIV_CODE: "J", FID_COND_SCR_DIV_CODE: "16633", FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: kstYmd(-90), FID_INPUT_DATE_2: kstYmd(),
    })),
    quoteOnly ? null : safe("재무비율", () => kisGet(F + "financial-ratio", "FHKST66430300", { FID_DIV_CLS_CODE: "0", fid_cond_mrkt_div_code: "J", fid_input_iscd: code })),
    quoteOnly ? null : safe("손익계산서", () => kisGet(F + "income-statement", "FHKST66430200", { FID_DIV_CLS_CODE: "0", fid_cond_mrkt_div_code: "J", fid_input_iscd: code })),
    quoteOnly ? null : safe("공매도", () => kisGet(Q + "daily-short-sale", "FHPST04830000", {
      FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code, FID_INPUT_DATE_1: kstYmd(-40), FID_INPUT_DATE_2: kstYmd(),
    })),
  ]);

  const o = price ? rows(price)[0] ?? {} : {};
  const cur = num(o.stck_prpr);
  const hi = num(o.w52_hgpr), lo = num(o.w52_lwpr);

  const quote = price ? {
    price: cur,
    change: num(o.prdy_vrss),
    changePct: num(o.prdy_ctrt),
    market: o.rprs_mrkt_kor_name ?? null,
    sector: (o.bstp_kor_isnm ?? "").trim() || null,
    per: num(o.per), pbr: num(o.pbr), eps: num(o.eps), bps: num(o.bps),
    marketCapEok: num(o.hts_avls),
    foreignRatio: num(o.hts_frgn_ehrt),
    volume: num(o.acml_vol),
    valueWon: num(o.acml_tr_pbmn),
    high52: hi, low52: lo,
    pos52: cur != null && hi && lo && hi > lo ? Math.round(((cur - lo) / (hi - lo)) * 100) : null,
  } : null;

  let consensus = null;
  if (opinion) {
    const list = rows(opinion);
    const counts = { buy: 0, hold: 0, sell: 0 };
    const targets: number[] = [];
    for (const r of list) {
      const c = opinionClass(r.invt_opnn ?? "");
      if (c) counts[c]++;
      const t = num(r.hts_goal_prc);
      if (t && t > 0) targets.push(t);
    }
    const avgTarget = targets.length ? Math.round(targets.reduce((a, b) => a + b, 0) / targets.length) : null;
    consensus = {
      reports: list.length,
      ...counts,
      avgTarget,
      maxTarget: targets.length ? Math.max(...targets) : null,
      minTarget: targets.length ? Math.min(...targets) : null,
      upsidePct: avgTarget && cur ? parseFloat((((avgTarget - cur) / cur) * 100).toFixed(1)) : null,
      latest: list.slice(0, 5).map(r => ({
        date: r.stck_bsop_date, opinion: (r.invt_opnn ?? "").trim(), target: num(r.hts_goal_prc),
      })),
    };
  }

  let financials = null;
  if (ratio || income) {
    const r0 = ratio ? rows(ratio)[0] ?? {} : {};
    const inc = income ? rows(income) : [];
    const [i0, i1] = inc;
    const yoy = (a?: string, b?: string) => {
      const x = num(a), y = num(b);
      return x != null && y ? parseFloat((((x - y) / Math.abs(y)) * 100).toFixed(1)) : null;
    };
    financials = {
      period: r0.stac_yymm ?? i0?.stac_yymm ?? null,
      sales: num(i0?.sale_account), salesYoY: yoy(i0?.sale_account, i1?.sale_account) ?? num(r0.grs),
      opProfit: num(i0?.bsop_prti), opProfitYoY: yoy(i0?.bsop_prti, i1?.bsop_prti) ?? num(r0.bsop_prfi_inrt),
      netIncome: num(i0?.thtr_ntin), netIncomeYoY: yoy(i0?.thtr_ntin, i1?.thtr_ntin) ?? num(r0.ntin_inrt),
      roe: num(r0.roe_val), debtRatio: num(r0.lblt_rate),
      history: inc.slice(0, 4).reverse().map(r => ({ period: r.stac_yymm, sales: num(r.sale_account), opProfit: num(r.bsop_prti) })),
    };
  }

  let shortSale = null;
  if (short) {
    const list = rows(short, "output2").filter(r => r.stck_bsop_date).sort((a, b) => b.stck_bsop_date.localeCompare(a.stck_bsop_date));
    const now = list[0], before = list[10];
    shortSale = now ? {
      date: now.stck_bsop_date,
      ratio: num(now.ssts_vol_rlim),
      ratioChange2w: before ? parseFloat(((num(now.ssts_vol_rlim) ?? 0) - (num(before.ssts_vol_rlim) ?? 0)).toFixed(2)) : null,
      amountWon: num(now.ssts_tr_pbmn),
    } : null;
  }

  const info = MASTER.get(code);
  return NextResponse.json({ code, name: info?.name ?? code, marketCode: info?.market ?? (o.rprs_mrkt_kor_name === "KOSDAQ" ? "KQ" : "KS"), quote, consensus, financials, shortSale, errors }, { headers: { "Cache-Control": "no-store" } });
}
