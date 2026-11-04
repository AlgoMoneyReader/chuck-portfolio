"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";

export const TIMEFRAMES = [
  ["1m", "1분"], ["2m", "2분"], ["5m", "5분"], ["30m", "30분"], ["60m", "1시간"], ["D", "일"], ["W", "주"], ["M", "월"],
] as const;
export type Timeframe = typeof TIMEFRAMES[number][0];

interface Candle { time: number | string; open: number; high: number; low: number; close: number; volume?: number }
const UP = "#1D9E75", DOWN = "#E24B4A";

function fmtTime(t: Time | undefined, intraday: boolean): string {
  if (t == null) return "";
  if (typeof t === "string") return t.replace(/-/g, ".");
  if (typeof t === "number") {
    const d = new Date(t * 1000);
    const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    return intraday ? `${md} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : md;
  }
  return `${t.year}.${t.month}.${t.day}`;
}

export default function CandleChart({ label, tf, height = 320, digits = 2, url }: { label: string; tf: Timeframe; height?: number; digits?: number; url?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [state, setState] = useState<{ candles: Candle[]; prevClose: number | null; source?: string; error?: string } | null>(null);
  const [hover, setHover] = useState<Candle | null>(null);
  const intraday = !["D", "W", "M"].includes(tf);

  useEffect(() => {
    setState(null); setHover(null);
    const src = url ? `${url}${url.includes("?") ? "&" : "?"}tf=${tf}` : `/api/candles?label=${encodeURIComponent(label)}&tf=${tf}`;
    const load = () => fetch(src, { cache: "no-store" })
      .then(r => r.json()).then(j => setState({ ...j, candles: j.candles ?? [] })).catch(e => setState({ candles: [], prevClose: null, error: String(e) }));
    load();
    const iv = intraday ? setInterval(load, 30_000) : undefined;
    return () => { if (iv) clearInterval(iv); };
  }, [label, tf, intraday, url]);

  useEffect(() => {
    if (!box.current || !state?.candles.length) return;
    let disposed = false;
    let ro: ResizeObserver | undefined;
    import("lightweight-charts").then(({ createChart, ColorType, CrosshairMode, LineStyle }) => {
      if (disposed || !box.current) return;
      chartRef.current?.remove();
      const chart = createChart(box.current, {
        width: box.current.clientWidth, height,
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8B93A7", fontFamily: "Pretendard Variable, Pretendard, sans-serif", fontSize: 11 },
        grid: { vertLines: { color: "rgba(26,37,69,0.6)" }, horzLines: { color: "rgba(26,37,69,0.6)" } },
        rightPriceScale: { borderColor: "#1A2545" },
        timeScale: { borderColor: "#1A2545", timeVisible: intraday, secondsVisible: false, rightOffset: 2 },
        crosshair: { mode: CrosshairMode.Normal },
        localization: { locale: "ko-KR", priceFormatter: (p: number) => p.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) },
      });
      chartRef.current = chart;
      const series: ISeriesApi<"Candlestick"> = chart.addCandlestickSeries({
        upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN,
      });
      series.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
      series.setData(state.candles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
      if (state.candles.some(c => c.volume)) {
        const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "", lastValueVisible: false, priceLineVisible: false });
        vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        vol.setData(state.candles.map(c => ({ time: c.time as Time, value: c.volume ?? 0, color: c.close >= c.open ? "rgba(29,158,117,0.35)" : "rgba(226,75,74,0.35)" })));
      }
      if (intraday && state.prevClose) {
        series.createPriceLine({ price: state.prevClose, color: "#9CA3AF", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "전일" });
      }
      chart.timeScale().fitContent();
      chart.subscribeCrosshairMove(p => {
        const d = p.seriesData.get(series) as Candle | undefined;
        setHover(d && "open" in d ? { ...d, time: p.time as number | string } : null);
      });
      ro = new ResizeObserver(([e]) => chart.applyOptions({ width: e.contentRect.width }));
      ro.observe(box.current);
    });
    return () => { disposed = true; ro?.disconnect(); chartRef.current?.remove(); chartRef.current = null; };
  }, [state, height, intraday, digits]);

  const last = state?.candles[state.candles.length - 1];
  const shown = hover ?? last;
  const idx = shown ? state!.candles.findIndex(c => String(c.time) === String(shown.time)) : -1;
  const base = intraday ? state?.prevClose ?? null : idx > 0 ? state!.candles[idx - 1].close : null;
  const chg = shown && base ? ((shown.close - base) / base) * 100 : null;
  const f = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

  return (
    <div className="space-y-1.5">
      <div className="min-h-[34px] text-[11px] num text-gray-400 flex flex-wrap gap-x-2.5 gap-y-0.5 items-center">
        {shown && (
          <>
            <span className="text-gray-300">{fmtTime(shown.time as Time, intraday)}</span>
            <span>시 <b className="text-white font-semibold">{f(shown.open)}</b></span>
            <span>고 <b className="text-signal-green font-semibold">{f(shown.high)}</b></span>
            <span>저 <b className="text-signal-red font-semibold">{f(shown.low)}</b></span>
            <span>종 <b className="text-white font-semibold">{f(shown.close)}</b></span>
            {chg != null && <span className={chg >= 0 ? "text-signal-green" : "text-signal-red"}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}% <span className="text-gray-500">{intraday ? "전일비" : "전봉비"}</span></span>}
          </>
        )}
      </div>
      <div className="relative" style={{ height }}>
        {!state ? <div className="absolute inset-0 bg-navy-border/30 rounded-xl animate-pulse" />
          : !state.candles.length ? <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">차트 데이터를 불러올 수 없습니다</p>
          : null}
        <div ref={box} className="absolute inset-0" />
      </div>
      {state?.source && <p className="text-[10px] text-gray-600 text-right">{state.source}</p>}
    </div>
  );
}
