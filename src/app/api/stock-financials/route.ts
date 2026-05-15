import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type Grade = "S" | "A" | "B" | "C" | "D" | "F";

function g(val: number | null, steps: [number, Grade][], fallback: Grade = "F"): Grade {
  if (val === null || isNaN(val)) return fallback;
  for (const [thr, grade] of steps) if (val >= thr) return grade;
  return fallback;
}

function gradeToScore(gr: Grade) { return { S: 100, A: 80, B: 60, C: 40, D: 20, F: 0 }[gr]; }

function fmtPct(v: number | null, mul = 100) {
  if (v === null || isNaN(v)) return "—";
  return `${(v * mul).toFixed(1)}%`;
}

function fmtNum(v: number | null, decimals = 1) {
  if (v === null || isNaN(v)) return "—";
  return v.toFixed(decimals);
}

function fmtCap(v: number | null) {
  if (!v) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e8)  return `${(v / 1e8).toFixed(0)}억`;
  return `${v.toLocaleString()}`;
}

// ── Yahoo Finance crumb 캐시 ──────────────────────────────────────────────────
let yahooCache: { cookie: string; crumb: string; expiresAt: number } | null = null;

const YF_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function getYahooCrumb(): Promise<{ cookie: string; crumb: string }> {
  const now = Date.now();
  if (yahooCache && yahooCache.expiresAt > now) return yahooCache;

  // 1) guce 동의 페이지 302 리다이렉트에서 A3/A1 쿠키 획득
  const guceRes = await fetch(
    "https://guce.yahoo.com/consent?brandType=nonEu&gcrumb=&done=https%3A%2F%2Ffinance.yahoo.com%2F",
    {
      headers: { "User-Agent": YF_UA, "Accept-Language": "en-US,en;q=0.9" },
      redirect: "manual",   // follow 하면 최종 응답에서 쿠키 소실
      cache: "no-store",
    }
  );
  const rawCookies = guceRes.headers.getSetCookie?.() ?? [];
  const cookie = rawCookies.map((c: string) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("no cookie");

  // 2) crumb 획득 (query2 → query1 순서로 시도)
  for (const host of ["query2", "query1"]) {
    try {
      const cr = await fetch(`https://${host}.finance.yahoo.com/v1/test/getcrumb`, {
        headers: { "User-Agent": YF_UA, Cookie: cookie, "Accept-Language": "en-US,en;q=0.9" },
        cache: "no-store",
      });
      const crumb = await cr.text();
      if (crumb && !crumb.includes("{") && !crumb.includes("Request") && crumb.length <= 20) {
        yahooCache = { cookie, crumb, expiresAt: now + 20 * 3600 * 1000 };
        return yahooCache;
      }
    } catch { /* try next host */ }
  }
  throw new Error("crumb unavailable");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker") ?? "";
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  try {
    const { cookie, crumb } = await getYahooCrumb();
    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}` +
      `?modules=financialData%2CdefaultKeyStatistics%2CsummaryDetail&crumb=${encodeURIComponent(crumb)}`,
      {
        headers: { "User-Agent": YF_UA, Cookie: cookie, "Accept-Language": "en-US,en;q=0.9" },
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`quoteSummary ${res.status}`);
    const j   = await res.json();
    const r   = j?.quoteSummary?.result?.[0];
    if (!r)  throw new Error("no result");

    const fd  = r.financialData      ?? {};
    const ks  = r.defaultKeyStatistics ?? {};
    const sd  = r.summaryDetail      ?? {};

    // raw values
    const roe        = (fd.returnOnEquity?.raw      as number | null) ?? null;
    const debtEq     = (fd.debtToEquity?.raw        as number | null) ?? null; // already in %, e.g. 45.2
    const opMargin   = (fd.operatingMargins?.raw    as number | null) ?? null; // decimal 0.12
    const profMargin = (fd.profitMargins?.raw       as number | null) ?? null;
    const revGrowth  = (fd.revenueGrowth?.raw       as number | null) ?? null;
    const grossMargin= (fd.grossMargins?.raw        as number | null) ?? null;
    const fcf        = (fd.freeCashflow?.raw        as number | null) ?? null;
    const trailingPE = (sd.trailingPE?.raw          as number | null) ?? null;
    const forwardPE  = (sd.forwardPE?.raw           as number | null) ?? null;
    const pb         = (ks.priceToBook?.raw         as number | null) ?? null;
    const evEbitda   = (ks.enterpriseToEbitda?.raw  as number | null) ?? null;
    const mktCap     = (sd.marketCap?.raw           as number | null) ?? null;
    const divYield   = (sd.dividendYield?.raw       as number | null) ?? null;
    const week52High = (sd.fiftyTwoWeekHigh?.raw    as number | null) ?? null;
    const week52Low  = (sd.fiftyTwoWeekLow?.raw     as number | null) ?? null;

    // grades — 부채비율: debtEq from Yahoo is already a % number (e.g. 45.2 = 45.2%)
    // roe, opMargin, profMargin, revGrowth, grossMargin are decimals (0.xx)
    const roeGrade    = g(roe,       [[0.25,"S"],[0.15,"A"],[0.10,"B"],[0.05,"C"],[0,"D"]]);
    const debtGrade   = g(debtEq !== null ? -debtEq : null, [[-50,"S"],[-100,"A"],[-150,"B"],[-200,"C"],[-300,"D"]],"F");
    const opGrade     = g(opMargin,  [[0.25,"S"],[0.15,"A"],[0.10,"B"],[0.05,"C"],[0,"D"]]);
    const profGrade   = g(profMargin,[[0.20,"S"],[0.12,"A"],[0.08,"B"],[0.03,"C"],[0,"D"]]);
    const growthGrade = g(revGrowth, [[0.30,"S"],[0.20,"A"],[0.10,"B"],[0.05,"C"],[0,"D"]]);
    const grossGrade  = g(grossMargin,[[0.60,"S"],[0.40,"A"],[0.25,"B"],[0.15,"C"],[0,"D"]]);

    const grades = [roeGrade, debtGrade, opGrade, profGrade, growthGrade];
    const finScore = Math.round(grades.map(gradeToScore).reduce((a, b) => a + b, 0) / grades.length);
    const finGrade: Grade = finScore >= 80 ? "S" : finScore >= 65 ? "A" : finScore >= 50 ? "B" : finScore >= 35 ? "C" : finScore >= 20 ? "D" : "F";

    // FCF sign label
    const fcfFmt = fcf === null ? "—" : fcf >= 0 ? `+${(fcf / 1e8).toFixed(0)}억` : `${(fcf / 1e8).toFixed(0)}억`;

    return NextResponse.json({
      metrics: [
        { label: "ROE",         formatted: fmtPct(roe),        grade: roeGrade,    raw: roe        },
        { label: "부채비율",    formatted: debtEq !== null ? `${debtEq.toFixed(1)}%` : "—", grade: debtGrade, raw: debtEq },
        { label: "영업이익률",  formatted: fmtPct(opMargin),   grade: opGrade,     raw: opMargin   },
        { label: "순이익률",    formatted: fmtPct(profMargin), grade: profGrade,   raw: profMargin },
        { label: "매출증가율",  formatted: fmtPct(revGrowth),  grade: growthGrade, raw: revGrowth  },
        { label: "매출총이익률",formatted: fmtPct(grossMargin),grade: grossGrade,  raw: grossMargin },
      ],
      valuation: {
        trailingPE: trailingPE !== null ? fmtNum(trailingPE) : "—",
        forwardPE:  forwardPE  !== null ? fmtNum(forwardPE)  : "—",
        pb:         pb         !== null ? fmtNum(pb)          : "—",
        evEbitda:   evEbitda   !== null ? fmtNum(evEbitda)    : "—",
        mktCap:     fmtCap(mktCap),
        divYield:   divYield   !== null ? `${(divYield * 100).toFixed(2)}%` : "—",
        week52High: week52High !== null ? week52High : null,
        week52Low:  week52Low  !== null ? week52Low  : null,
        fcf:        fcfFmt,
      },
      finScore,
      finGrade,
      timestamp: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
