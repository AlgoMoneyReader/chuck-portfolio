"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FiChevronLeft } from "react-icons/fi";

const StockDetailDrawer = lazy(() => import("./StockDetailDrawer"));

interface Item { s: string; n: string; sec: string; ind: string; cap: number; pct: number; price: number }
interface Data { index: string; source: string; asOf: string; total: number; items: Item[]; breadth: { up: number; down: number; flat: number }; error?: string }
interface Rect { x: number; y: number; w: number; h: number }

type Region = "KR" | "US";
const INDEXES: Record<Region, { key: string; label: string; desc: string }[]> = {
  KR: [
    { key: "KOSPI", label: "코스피", desc: "코스피 시가총액 상위" },
    { key: "KOSDAQ", label: "코스닥", desc: "코스닥 시가총액 상위" },
  ],
  US: [
    { key: "SPY", label: "SPY", desc: "S&P 500 구성 종목" },
    { key: "QQQ", label: "QQQ", desc: "나스닥 100 구성 종목" },
    { key: "DIA", label: "DIA", desc: "다우존스 30 구성 종목" },
    { key: "SOXX", label: "SOXX", desc: "반도체 ETF 구성 종목" },
  ],
};
const ALL = "전체";

// ── 정사각형에 가깝게 나누는 트리맵 (squarify) ───────────────────────────────
function worst(row: number[], side: number) {
  const s = row.reduce((a, b) => a + b, 0);
  return Math.max(...row.map(r => Math.max((side * side * r) / (s * s), (s * s) / (side * side * r))));
}
function squarify(values: number[], r: Rect): Rect[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0 || r.w <= 0 || r.h <= 0) return values.map(() => ({ ...r, w: 0, h: 0 }));
  const areas = values.map(v => (v * r.w * r.h) / total);
  const out: Rect[] = [];
  let { x, y, w, h } = r;
  let i = 0;
  while (i < areas.length) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) { row.push(areas[j]); j++; }
    const s = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const cw = s / h; let yy = y;
      for (const a of row) { out.push({ x, y: yy, w: cw, h: a / cw }); yy += a / cw; }
      x += cw; w -= cw;
    } else {
      const rh = s / w; let xx = x;
      for (const a of row) { out.push({ x: xx, y, w: a / rh, h: rh }); xx += a / rh; }
      y += rh; h -= rh;
    }
    i = j;
  }
  return out;
}

// finviz 계열 색: -3% 이하 빨강 ~ 0% 회색 ~ +3% 이상 초록
const STOPS: [number, [number, number, number]][] = [
  [-3, [246, 53, 56]], [-2, [191, 64, 69]], [-1, [139, 68, 78]], [0, [65, 69, 84]],
  [1, [53, 118, 78]], [2, [47, 158, 79]], [3, [48, 204, 90]],
];
function colorFor(p: number): string {
  const v = Math.max(-3, Math.min(3, p));
  for (let k = 1; k < STOPS.length; k++) {
    const [p1, c1] = STOPS[k - 1], [p2, c2] = STOPS[k];
    if (v <= p2) {
      const t = (v - p1) / (p2 - p1);
      const c = c1.map((a, i) => Math.round(a + (c2[i] - a) * t));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return "rgb(48,204,90)";
}
const fmtPct = (p: number) => `${p > 0 ? "+" : ""}${p.toFixed(2)}%`;
const weighted = (xs: Item[]) => {
  const c = xs.reduce((a, b) => a + b.cap, 0) || 1;
  return xs.reduce((a, b) => a + b.pct * b.cap, 0) / c;
};

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Tile({ r, bg, title, sub, onClick, active }: { r: Rect; bg: string; title: string; sub?: string; onClick?: () => void; active?: boolean }) {
  const m = Math.min(r.w, r.h);
  // 한글은 영문보다 넓으니 글자 폭을 따로 셈해서 칸 너비 안에 들어가게
  const em = (t: string) => Array.from(t).reduce((a, ch) => a + (/[가-힣]/.test(ch) ? 1 : 0.62), 0);
  const big = Math.max(9, Math.min(34, m / 3.2, (r.w - 8) / Math.max(1, em(title))));
  const subSize = Math.max(9, Math.min(big * 0.55, (r.w - 6) / Math.max(1, em(sub ?? "") * 0.95)));
  const showTitle = m > 18 && r.w > 26;
  const showSub = sub && m > 34 && r.w > 42;
  return (
    <button onClick={onClick} title={`${title}${sub ? ` ${sub}` : ""}`}
      className={`absolute flex flex-col items-center justify-center overflow-hidden text-white leading-tight ${active ? "ring-2 ring-white z-10" : ""}`}
      style={{ left: r.x + 1, top: r.y + 1, width: Math.max(0, r.w - 2), height: Math.max(0, r.h - 2), background: bg }}>
      {showTitle && <span className="font-extrabold truncate max-w-full px-0.5" style={{ fontSize: big }}>{title}</span>}
      {showSub && <span className="num opacity-90 truncate max-w-full" style={{ fontSize: subSize }}>{sub}</span>}
    </button>
  );
}

export default function MarketMap() {
  const [region, setRegion] = useState<Region>("KR");
  const [index, setIndex] = useState("KOSPI");
  const [sector, setSector] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [usDetail, setUsDetail] = useState<Item | null>(null);
  const router = useRouter();
  const openDetail = (it: Item) => (region === "KR" ? router.push(`/stock/${it.s}`) : setUsDetail(it));
  const [ref, width] = useWidth();

  useEffect(() => {
    setLoading(true);
    setSector(index === "SOXX" ? ALL : null);
    const url = region === "KR" ? `/api/kr-heatmap?market=${index}` : `/api/heatmap?index=${index}`;
    const load = () => fetch(url, { cache: "no-store" })
      .then(r => r.json()).then(j => setData(j)).catch(() => setData(null)).finally(() => setLoading(false));
    load();
    const iv = setInterval(load, 3 * 60 * 1000);
    return () => clearInterval(iv);
  }, [region, index]);

  const items = useMemo(() => (data?.items ?? []).filter(i => i.cap > 0), [data]);
  // 휴대폰은 세로로 길게, PC 처럼 넓은 화면은 가로로 넓적하게 + 최대 높이 제한
  const H = Math.round(width < 640 ? width * (sector ? 1.05 : 0.85) : Math.min(width * (sector ? 0.55 : 0.45), sector ? 600 : 480));

  const sectors = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) m.set(i.sec, [...(m.get(i.sec) ?? []), i]);
    return Array.from(m.entries())
      .map(([name, xs]) => ({ name, xs, cap: xs.reduce((a, b) => a + b.cap, 0), pct: weighted(xs) }))
      .sort((a, b) => b.cap - a.cap);
  }, [items]);

  const inView = sector && sector !== ALL ? items.filter(i => i.sec === sector) : items;
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of inView) m.set(i.ind, [...(m.get(i.ind) ?? []), i]);
    return Array.from(m.entries())
      .map(([name, xs]) => ({ name, xs: xs.sort((a, b) => b.cap - a.cap), cap: xs.reduce((a, b) => a + b.cap, 0) }))
      .sort((a, b) => b.cap - a.cap);
  }, [inView]);

  const breadth = useMemo(() => {
    const up = inView.filter(i => i.pct > 0).length, dn = inView.filter(i => i.pct < 0).length;
    return { up, dn, flat: inView.length - up - dn };
  }, [inView]);

  const desc = INDEXES[region].find(i => i.key === index)?.desc ?? "";
  const label = (it: Item) => (region === "KR" ? it.n : it.s);
  const tiles: React.ReactNode[] = [];
  if (width > 0 && items.length) {
    const box = { x: 0, y: 0, w: width, h: H };
    if (!sector) {
      squarify(sectors.map(s => s.cap), box).forEach((r, k) => {
        const s = sectors[k];
        tiles.push(<Tile key={s.name} r={r} bg={colorFor(s.pct)} title={s.name} sub={`${fmtPct(s.pct)} · ${s.xs.length}종목`} onClick={() => setSector(s.name)} />);
      });
    } else {
      squarify(groups.map(g => g.cap), box).forEach((gr, k) => {
        const g = groups[k];
        const head = groups.length > 1 && gr.h > 40 && gr.w > 50 ? 15 : 0;
        if (head) {
          tiles.push(
            <div key={`h-${g.name}`} className="absolute px-1 text-[10px] font-semibold text-white truncate bg-black/40"
              style={{ left: gr.x + 1, top: gr.y + 1, width: Math.max(0, gr.w - 2), height: head - 1, lineHeight: `${head - 1}px` }}>{g.name}</div>
          );
        }
        squarify(g.xs.map(i => i.cap), { x: gr.x, y: gr.y + head, w: gr.w, h: gr.h - head }).forEach((r, j) => {
          const it = g.xs[j];
          tiles.push(<Tile key={it.s} r={r} bg={colorFor(it.pct)} title={label(it)} sub={fmtPct(it.pct)} onClick={() => openDetail(it)} />);
        });
      });
    }
  }

  const total = breadth.up + breadth.dn + breadth.flat || 1;
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white">마켓맵</h2>
        <div className="flex rounded-lg bg-navy-sub p-0.5 text-xs">
          {(["KR", "US"] as Region[]).map(r => (
            <button key={r} onClick={() => { setRegion(r); setIndex(INDEXES[r][0].key); }}
              className={`px-3 py-1 rounded-md font-semibold ${region === r ? "bg-navy-card text-white" : "text-gray-500"}`}>{r === "KR" ? "국내" : "미국"}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {INDEXES[region].map(i => (
          <button key={i.key} onClick={() => setIndex(i.key)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold ${index === i.key ? "bg-white text-navy" : "bg-navy-sub text-gray-300"}`}>{i.label}</button>
        ))}
      </div>

      {sector && index !== "SOXX" ? (
        <div className="flex items-center gap-2">
          <button onClick={() => setSector(null)} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-navy-sub text-xs text-gray-300">
            <FiChevronLeft /> {index}
          </button>
          <span className="text-sm font-bold text-white">{sector} · {inView.length}종목</span>
        </div>
      ) : (
        <p className="text-xs text-gray-400">{desc} · {items.length}종목{!sector ? ` · ${region === "KR" ? "업종" : "섹터"}을 누르면 종목이 보입니다` : ""}</p>
      )}

      <div ref={ref} className="relative w-full rounded-lg overflow-hidden bg-navy-sub" style={{ height: width ? H : 300 }}>
        {loading && !items.length ? <div className="absolute inset-0 animate-pulse bg-navy-border/40" />
          : !items.length ? <p className="absolute inset-0 flex flex-col items-center justify-center text-sm text-gray-500 px-4 text-center">히트맵 데이터를 불러올 수 없습니다{data?.error && <span className="text-[10px] text-gray-600 mt-1 break-all">{data.error}</span>}</p>
          : tiles}
      </div>

      {usDetail && (
        <Suspense fallback={null}>
          <StockDetailDrawer code={usDetail.s} market="US" name={usDetail.n} onClose={() => setUsDetail(null)} />
        </Suspense>
      )}

      <div className="grid grid-cols-7 gap-1">
        {[-3, -2, -1, 0, 1, 2, 3].map(p => (
          <span key={p} className="text-center text-[11px] font-semibold text-white py-1 rounded num" style={{ background: colorFor(p) }}>
            {p > 0 ? `+${p}` : p}%
          </span>
        ))}
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
        <div className="bg-signal-green" style={{ width: `${(breadth.up / total) * 100}%` }} />
        <div className="bg-gray-500" style={{ width: `${(breadth.flat / total) * 100}%` }} />
        <div className="bg-signal-red" style={{ width: `${(breadth.dn / total) * 100}%` }} />
      </div>
      <p className="text-xs text-gray-400 num">상승 {breadth.up} · 보합 {breadth.flat} · 하락 {breadth.dn}</p>
      {data?.source && <p className="text-[10px] text-gray-600">{data.source} · 칸 크기 = 시가총액</p>}
    </section>
  );
}
