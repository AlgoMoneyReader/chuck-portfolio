// Yahoo 일봉 5일치로 '오늘 등락률'을 직접 계산 (spark range=1d 의 전일 종가가 가끔 어긋나는 문제 보완)
// 마지막 일봉이 최근 거래일(regularMarketTime 날짜)이면 그 앞 봉이 전일 종가, 아니면 마지막 봉이 전일 종가
export interface DailyQuote { symbol: string; price: number; prev: number; change: number; changePct: number; volume: number }

export async function yahooDaily(symbols: string[]): Promise<Record<string, DailyQuote>> {
  const out: Record<string, DailyQuote> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 15) chunks.push(symbols.slice(i, i + 15));
  await Promise.all(chunks.map(async c => {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${c.map(encodeURIComponent).join(",")}&range=5d&interval=1d`,
        { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!r.ok) return;
      const j = await r.json();
      for (const x of (j?.spark?.result ?? []) as Record<string, unknown>[]) {
        const resp = (x.response as Record<string, unknown>[])?.[0];
        if (!resp) continue;
        const m = (resp.meta ?? {}) as Record<string, number>;
        const ts = (resp.timestamp as number[] | undefined) ?? [];
        const q = (resp.indicators as { quote?: { close?: (number | null)[]; volume?: (number | null)[] }[] })?.quote?.[0];
        const bars = ts.map((t, i) => ({ t, c: q?.close?.[i] ?? null, v: q?.volume?.[i] ?? null })).filter(b => b.c != null) as { t: number; c: number; v: number | null }[];
        const price = m.regularMarketPrice ?? bars[bars.length - 1]?.c;
        if (!price || !bars.length) continue;
        const day = (t: number) => new Date((t + (m.gmtoffset ?? 0)) * 1000).toISOString().slice(0, 10);
        const lastIsToday = m.regularMarketTime ? day(bars[bars.length - 1].t) === day(m.regularMarketTime) : true;
        const prevBar = lastIsToday ? bars[bars.length - 2] : bars[bars.length - 1];
        const prev = prevBar?.c ?? m.chartPreviousClose;
        if (!prev) continue;
        out[x.symbol as string] = {
          symbol: x.symbol as string, price, prev, change: price - prev, changePct: ((price - prev) / prev) * 100,
          volume: m.regularMarketVolume ?? (lastIsToday ? bars[bars.length - 1].v ?? 0 : 0),
        };
      }
    } catch { /* 건너뜀 */ }
  }));
  return out;
}
