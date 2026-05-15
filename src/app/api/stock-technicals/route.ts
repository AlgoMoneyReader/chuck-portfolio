import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type Grade = "S" | "A" | "B" | "C" | "D" | "F";

// ── Wilder Smoothing (ADX용) ───────────────────────────────────────────────────
function wilderSmooth(arr: number[], period: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < period && i < arr.length; i++) sum += arr[i] ?? 0;
  if (arr.length >= period) out[period - 1] = sum / period;
  for (let i = period; i < arr.length; i++)
    out[i] = ((out[i - 1] ?? 0) * (period - 1) + (arr[i] ?? 0)) / period;
  return out;
}

function g(value: number, steps: [number, Grade][]): Grade {
  for (const [thr, grade] of steps) if (value >= thr) return grade;
  return "F";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker") ?? "";
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=3mo`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`chart fetch ${res.status}`);
    const j = await res.json();
    const result = j?.chart?.result?.[0];
    if (!result) throw new Error("no data");

    const q       = result.indicators?.quote?.[0] ?? {};
    const highs   = (q.high   ?? []).map((v: number | null) => v ?? NaN);
    const lows    = (q.low    ?? []).map((v: number | null) => v ?? NaN);
    const closes  = (q.close  ?? []).map((v: number | null) => v ?? NaN);
    const volumes = (q.volume ?? []).map((v: number | null) => v ?? 0);
    const n       = closes.length;
    if (n < 25) throw new Error("need >=25 days");

    const price = closes[n - 1];

    // ── TV5/20 (거래대금비율) ─────────────────────────────────────────────────
    const tv   = closes.map((c: number, i: number) => (isNaN(c) ? 0 : c * volumes[i]));
    const tv5  = tv.slice(-6, -1).reduce((a: number, b: number) => a + b, 0) / 5;
    const tv20 = tv.slice(-21, -1).reduce((a: number, b: number) => a + b, 0) / 20;
    const tv5_20 = tv20 > 0 ? parseFloat((tv5 / tv20).toFixed(2)) : 0;

    // ── V5/20 (거래량비율) ────────────────────────────────────────────────────
    const vol5  = volumes.slice(-6, -1).reduce((a: number, b: number) => a + b, 0) / 5;
    const vol20 = volumes.slice(-21, -1).reduce((a: number, b: number) => a + b, 0) / 20;
    const v5_20 = vol20 > 0 ? parseFloat((vol5 / vol20).toFixed(2)) : 0;

    // ── ADX(14) ───────────────────────────────────────────────────────────────
    const trArr: number[] = [], pmArr: number[] = [], nmArr: number[] = [];
    for (let i = 1; i < n; i++) {
      if (isNaN(highs[i]) || isNaN(lows[i]) || isNaN(closes[i])) continue;
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i]  - closes[i - 1])
      );
      const up   = highs[i] - highs[i - 1];
      const down = lows[i - 1] - lows[i];
      trArr.push(tr);
      pmArr.push(up > down && up > 0 ? up : 0);
      nmArr.push(down > up && down > 0 ? down : 0);
    }
    const atr  = wilderSmooth(trArr, 14);
    const pdi  = wilderSmooth(pmArr, 14);
    const ndi  = wilderSmooth(nmArr, 14);
    const dxArr: number[] = [];
    for (let i = 13; i < atr.length; i++) {
      if (!atr[i] || isNaN(atr[i])) continue;
      const p = 100 * pdi[i] / atr[i];
      const nd = 100 * ndi[i] / atr[i];
      const s  = p + nd;
      dxArr.push(s ? 100 * Math.abs(p - nd) / s : 0);
    }
    const adxArr = wilderSmooth(dxArr, 14);
    const adx14  = parseFloat((adxArr[adxArr.length - 1] ?? 0).toFixed(1));

    // ── MFI(14) ───────────────────────────────────────────────────────────────
    const tp  = closes.map((c: number, i: number) => isNaN(c) ? 0 : (highs[i] + lows[i] + c) / 3);
    const rmf = tp.map((t: number, i: number) => t * volumes[i]);
    let pos = 0, neg = 0;
    for (let i = n - 14; i < n; i++) {
      if (tp[i] > tp[i - 1]) pos += rmf[i]; else neg += rmf[i];
    }
    const mfi14 = neg === 0 ? 100 : parseFloat((100 - 100 / (1 + pos / neg)).toFixed(1));

    // ── CMF(20) ───────────────────────────────────────────────────────────────
    let cmfMfv = 0, cmfVol = 0;
    for (let i = n - 20; i < n; i++) {
      const hl = highs[i] - lows[i];
      if (!hl || isNaN(hl)) continue;
      cmfMfv += ((closes[i] - lows[i]) - (highs[i] - closes[i])) / hl * volumes[i];
      cmfVol += volumes[i];
    }
    const cmf20 = cmfVol > 0 ? parseFloat((cmfMfv / cmfVol).toFixed(3)) : 0;

    // ── CLV (최근) ────────────────────────────────────────────────────────────
    const hl0 = highs[n - 1] - lows[n - 1];
    const clv  = hl0 > 0
      ? parseFloat((((closes[n - 1] - lows[n - 1]) - (highs[n - 1] - closes[n - 1])) / hl0).toFixed(2))
      : 0;

    // ── VWAP20 편차 (%) ───────────────────────────────────────────────────────
    let vnum = 0, vden = 0;
    for (let i = n - 20; i < n; i++) {
      if (isNaN(closes[i])) continue;
      const t = (highs[i] + lows[i] + closes[i]) / 3;
      vnum += t * volumes[i]; vden += volumes[i];
    }
    const vwap20     = vden > 0 ? vnum / vden : price;
    const vwap20Dev  = parseFloat(((price - vwap20) / vwap20 * 100).toFixed(2));

    // ── UDVR60 (상승거래량/하락거래량 비율) ─────────────────────────────────
    let upVol = 0, dnVol = 0;
    const start60 = Math.max(1, n - 60);
    for (let i = start60; i < n; i++) {
      if (closes[i] > closes[i - 1]) upVol += volumes[i];
      else dnVol += volumes[i];
    }
    const udvr60 = dnVol > 0 ? parseFloat((upVol / dnVol).toFixed(2)) : 0;

    // ── TTM Squeeze ───────────────────────────────────────────────────────────
    const p20 = 20;
    const rc = closes.slice(-p20), rh = highs.slice(-p20), rl = lows.slice(-p20);
    const mean20 = rc.filter((v: number) => !isNaN(v)).reduce((a: number, b: number) => a + b, 0) / p20;
    const std20  = Math.sqrt(rc.filter((v: number) => !isNaN(v)).reduce((a: number, b: number) => a + (b - mean20) ** 2, 0) / p20);
    let kAtr = 0;
    const prevC = closes.slice(-(p20 + 1));
    for (let i = 0; i < p20; i++) {
      const tr = Math.max(rh[i] - rl[i], Math.abs(rh[i] - prevC[i]), Math.abs(rl[i] - prevC[i]));
      kAtr += tr;
    }
    kAtr /= p20;
    const bbW = 2 * std20, kcW = 2 * 1.5 * kAtr;
    const squeezeOn = bbW < kcW;

    // ── 등급 ─────────────────────────────────────────────────────────────────
    const tv5_20Grade  = g(tv5_20,    [[3,"S"],[2,"A"],[1.5,"B"],[1,"C"],[0.7,"D"]]);
    const v5_20Grade   = g(v5_20,     [[3,"S"],[2,"A"],[1.5,"B"],[1,"C"],[0.7,"D"]]);
    const adxGrade     = g(adx14,     [[40,"S"],[30,"A"],[25,"B"],[20,"C"],[15,"D"]]);
    const mfiGrade     = g(mfi14,     [[80,"S"],[65,"A"],[50,"B"],[40,"C"],[25,"D"]]);
    const cmfGrade     = g(cmf20,     [[0.20,"S"],[0.10,"A"],[0.05,"B"],[0,"C"],[-0.10,"D"]]);
    const clvGrade     = g(clv,       [[0.7,"S"],[0.4,"A"],[0.1,"B"],[-0.1,"C"],[-0.4,"D"]]);
    const vwapGrade    = g(vwap20Dev, [[10,"S"],[5,"A"],[0,"B"],[-5,"C"],[-10,"D"]]);
    const udvrGrade    = g(udvr60,    [[3,"S"],[2,"A"],[1.5,"B"],[1,"C"],[0.7,"D"]]);
    const squeezeGrade: Grade = squeezeOn ? "A" : "C";

    const gradeScore = (gr: Grade) => ({ S: 100, A: 80, B: 60, C: 40, D: 20, F: 0 }[gr]);
    const techScore  = Math.round(
      [tv5_20Grade, v5_20Grade, adxGrade, mfiGrade, cmfGrade, clvGrade, vwapGrade, udvrGrade]
      .map(gradeScore).reduce((a, b) => a + b, 0) / 8
    );
    const techGrade: Grade = techScore >= 80 ? "S" : techScore >= 65 ? "A" : techScore >= 50 ? "B" : techScore >= 35 ? "C" : techScore >= 20 ? "D" : "F";

    return NextResponse.json({
      indicators: [
        { key: "tv5_20",  value: tv5_20,   grade: tv5_20Grade,  label: "TV5/20",    display: tv5_20.toFixed(2)   },
        { key: "v5_20",   value: v5_20,    grade: v5_20Grade,   label: "V5/20",     display: v5_20.toFixed(2)    },
        { key: "adx14",   value: adx14,    grade: adxGrade,     label: "ADX",       display: adx14.toFixed(1)    },
        { key: "mfi14",   value: mfi14,    grade: mfiGrade,     label: "MFI14",     display: mfi14.toFixed(1)    },
        { key: "cmf20",   value: cmf20,    grade: cmfGrade,     label: "CMF20",     display: cmf20.toFixed(3)    },
        { key: "clv",     value: clv,      grade: clvGrade,     label: "CLV",       display: clv.toFixed(2)      },
        { key: "vwap20",  value: vwap20Dev,grade: vwapGrade,    label: "VWAP20",    display: `${vwap20Dev > 0 ? "+" : ""}${vwap20Dev.toFixed(1)}%` },
        { key: "udvr60",  value: udvr60,   grade: udvrGrade,    label: "UDVR60",    display: udvr60.toFixed(2)   },
        { key: "squeeze", value: squeezeOn ? 1 : 0, grade: squeezeGrade, label: "SQUEEZE", display: squeezeOn ? "ON" : "OFF" },
      ],
      techScore,
      techGrade,
      timestamp: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
