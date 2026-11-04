"use client";

import { useEffect, useState } from "react";
import { useMarketPoll } from "@/lib/useMarketPoll";
import AddToPortfolio from "@/components/AddToPortfolio";
import { krSession } from "@/lib/krSession";
import RadarReport from "@/components/RadarReport";
import { logActivity } from "@/lib/activity";
import { useRouter } from "next/navigation";
import { FiChevronLeft, FiHeart } from "react-icons/fi";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import CandleChart, { TIMEFRAMES, type Timeframe } from "@/components/CandleChart";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { relTime } from "@/lib/time";
import { useChartColors } from "@/lib/theme";

interface Overview {
  session?: { key: string; label: string; short: string; extended: boolean };
  nxt?: { price: number; change: number; pct: number } | null;
  code: string; name: string; marketCode: "KS" | "KQ";
  quote: {
    price: number | null; change: number | null; changePct: number | null; market: string | null; sector: string | null;
    per: number | null; pbr: number | null; eps: number | null; bps: number | null; marketCapEok: number | null;
    foreignRatio: number | null; volume: number | null; valueWon: number | null;
    high52: number | null; low52: number | null; pos52: number | null;
  } | null;
  consensus: {
    reports: number; buy: number; hold: number; sell: number;
    avgTarget: number | null; maxTarget: number | null; minTarget: number | null; upsidePct: number | null;
    latest: { date: string; opinion: string; target: number | null }[];
  } | null;
  financials: {
    period: string | null; sales: number | null; salesYoY: number | null; opProfit: number | null; opProfitYoY: number | null;
    netIncome: number | null; netIncomeYoY: number | null; roe: number | null; debtRatio: number | null;
    history: { period: string; sales: number | null; opProfit: number | null }[];
  } | null;
  shortSale: { date: string; ratio: number | null; ratioChange2w: number | null; amountWon: number | null } | null;
  errors: string[];
}

const TABS = ["개요", "레이더", "차트", "수급", "뉴스", "공시"] as const;
type Tab = typeof TABS[number];

const won = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("ko-KR"));
const eok = (n: number | null | undefined) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 10000) return `${(n / 10000).toFixed(a >= 100000 ? 0 : 1)}조`;
  if (a > 0 && a < 1) return `${Math.round(n * 10000).toLocaleString("ko-KR")}만`;
  return `${(a >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString("ko-KR")}억`;
};
const pct = (n: number | null | undefined, digits = 1) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`);
const tone = (n: number | null | undefined) => (n == null ? "text-gray-400" : n >= 0 ? "text-signal-green" : "text-signal-red");
const ymd = (s?: string | null) => (s && s.length >= 6 ? `${s.slice(0, 4)}.${s.slice(4, 6)}${s.length >= 8 ? "." + s.slice(6, 8) : ""}` : "");

function Stat({ label, value, sub, subCls }: { label: string; value: string; sub?: string; subCls?: string }) {
  return (
    <div>
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-base font-bold text-white num mt-0.5">{value}</p>
      {sub && <p className={`text-[11px] num mt-0.5 ${subCls ?? "text-gray-500"}`}>{sub}</p>}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-bold text-white">{title}</h2>
        {note && <span className="text-[11px] text-gray-500">{note}</span>}
      </div>
      {children}
    </section>
  );
}

interface QRow { prelim?: boolean; period: string; sales: number | null; op: number | null; net: number | null; salesYoY: number | null; opYoY: number | null; netYoY: number | null }
interface ARow { year: number; sales: number | null; op: number | null; net: number | null }

interface EarnRow { key: string; label: string; short: string; sales: number | null; op: number | null; net: number | null; opm: number | null; npm: number | null; qoq: number | null; yoy: number | null }

const marginOf = (a: number | null, base: number | null) => (a != null && base ? (a / base) * 100 : null);
const growth = (a: number | null, b: number | null) => (a != null && b ? ((a - b) / Math.abs(b)) * 100 : null);

function EarnTooltip({ active, payload }: { active?: boolean; payload?: { payload: EarnRow }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="bg-navy-card border border-navy-border rounded-xl px-3 py-2.5 text-xs shadow-xl space-y-1 min-w-[150px]">
      <p className="text-gray-400 mb-1">{r.label}</p>
      <p className="flex justify-between gap-4"><span className="text-[#5B8CFF]">■ 매출</span><span className="text-white num">{eok(r.sales)}</span></p>
      <p className="flex justify-between gap-4"><span className="text-signal-green">■ 영업이익</span><span className="text-white num">{eok(r.op)}</span></p>
      <p className="flex justify-between gap-4"><span className="text-amber-400">○ 영업이익률</span><span className="text-white num">{r.opm != null ? `${r.opm.toFixed(1)}%` : "—"}</span></p>
      {r.qoq != null && <p className="flex justify-between gap-4"><span className="text-gray-400">전분기 대비</span><span className={`num ${tone(r.qoq)}`}>{pct(r.qoq)}</span></p>}
      {r.yoy != null && <p className="flex justify-between gap-4"><span className="text-gray-400">전년 동기 대비</span><span className={`num ${tone(r.yoy)}`}>{pct(r.yoy)}</span></p>}
    </div>
  );
}

function EarningsSection({ code, kis }: { code: string; kis: Overview["financials"] }) {
  const [q, setQ] = useState<{ quarters: QRow[]; annual: ARow[]; latest: QRow | null; error?: string } | null>(null);
  const dotFill = useChartColors().dot;
  const [mode, setMode] = useState<"q" | "y">("q");
  useEffect(() => {
    fetch(`/api/stock-quarterly?code=${code}`, { cache: "no-store" }).then(r => r.json()).then(setQ).catch(() => setQ(null));
  }, [code]);

  const quarterRows: EarnRow[] = (q?.quarters ?? []).map((r, i, arr) => ({
    key: r.period, label: `${r.period.slice(2, 4)}년 ${r.period.slice(-2, -1)}분기${r.prelim ? "(잠정)" : ""}`, short: `${r.period.slice(2, 4)}.${r.period.slice(-2)}${r.prelim ? "*" : ""}`,
    sales: r.sales, op: r.op, net: r.net, opm: marginOf(r.op, r.sales), npm: marginOf(r.net, r.sales),
    qoq: i > 0 ? growth(r.op, arr[i - 1].op) : null, yoy: r.opYoY,
  }));
  const annualRows: EarnRow[] = (q?.annual ?? []).map((r, i, arr) => ({
    key: String(r.year), label: `${r.year}년`, short: String(r.year),
    sales: r.sales, op: r.op, net: r.net, opm: marginOf(r.op, r.sales), npm: marginOf(r.net, r.sales),
    qoq: null, yoy: i > 0 ? growth(r.op, arr[i - 1].op) : null,
  }));
  const rows = mode === "q" ? quarterRows : annualRows;
  const L = q?.latest;
  const lastQ = quarterRows[quarterRows.length - 1];

  if (!L && !kis) return null;
  return (
    <Section title="실적" note={L ? "DART 정기보고서 · 연결 기준" : kis?.period ? `연간 · 결산 ${ymd(kis.period)}` : undefined}>
      {lastQ ? (
        <p className="text-sm text-gray-300 leading-relaxed">
          {lastQ.label.replace(/^(\d+)년/, "20$1년")} 영업이익은 <b className="text-white">{eok(lastQ.op)}</b>
          {lastQ.qoq != null && <> · 직전 분기 대비 <b className={tone(lastQ.qoq)}>{pct(lastQ.qoq)}</b></>}
          {lastQ.yoy != null && <> · 전년 동기 대비 <b className={tone(lastQ.yoy)}>{pct(lastQ.yoy)}</b></>}
          {q?.latest?.prelim && <span className="block text-[11px] text-gold mt-1">* 잠정실적(공정공시) 기준 · 분기보고서가 제출되면 확정치로 바뀝니다</span>}
        </p>
      ) : kis && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="매출" value={eok(kis.sales)} sub={`${pct(kis.salesYoY)} YoY`} subCls={tone(kis.salesYoY)} />
          <Stat label="영업이익" value={eok(kis.opProfit)} sub={`${pct(kis.opProfitYoY)} YoY`} subCls={tone(kis.opProfitYoY)} />
          <Stat label="순이익" value={eok(kis.netIncome)} sub={`${pct(kis.netIncomeYoY)} YoY`} subCls={tone(kis.netIncomeYoY)} />
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex gap-1">
            {([["q", "분기"], ["y", "연간"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)}
                className={`px-3 py-1 text-xs rounded-lg ${mode === k ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40" : "text-gray-500 border border-navy-border"}`}>{l}</button>
            ))}
          </div>
          <div className="h-52 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A2545" vertical={false} />
                <XAxis dataKey="short" tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis yAxisId="v" tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={v => eok(Number(v))} />
                <YAxis yAxisId="p" orientation="right" tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} width={34} tickFormatter={v => `${Math.round(Number(v))}%`} />
                <Tooltip content={<EarnTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                <Bar yAxisId="v" dataKey="sales" name="매출" fill="#5B8CFF" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar yAxisId="v" dataKey="op" name="영업이익" fill="#1D9E75" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Line yAxisId="p" dataKey="opm" name="영업이익률" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3, fill: dotFill, stroke: "#F59E0B" }} isAnimationActive={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto -mx-4 md:-mx-6 scrollbar-none">
            <table className="text-xs num whitespace-nowrap">
              <thead>
                <tr className="text-gray-500">
                  <th className="sticky left-0 bg-navy-card text-left font-normal px-4 py-2 min-w-[96px]">구분</th>
                  {rows.map(r => <th key={r.key} className="font-normal px-3 py-2 text-right">{r.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-border">
                {([
                  ["매출", (r: EarnRow) => eok(r.sales), null],
                  ["영업이익", (r: EarnRow) => eok(r.op), null],
                  ["영업이익률", (r: EarnRow) => (r.opm != null ? `${r.opm.toFixed(1)}%` : "—"), null],
                  ["순이익", (r: EarnRow) => eok(r.net), null],
                  ["순이익률", (r: EarnRow) => (r.npm != null ? `${r.npm.toFixed(1)}%` : "—"), null],
                  ...(mode === "q" ? [["영업이익 전분기비", (r: EarnRow) => pct(r.qoq), "qoq"] as const] : []),
                  ["영업이익 " + (mode === "q" ? "전년동기비" : "전년비"), (r: EarnRow) => pct(r.yoy), "yoy"],
                ] as [string, (r: EarnRow) => string, "qoq" | "yoy" | null][]).map(([name, f, k]) => (
                  <tr key={name}>
                    <td className="sticky left-0 bg-navy-card text-gray-300 px-4 py-2">{name}</td>
                    {rows.map(r => <td key={r.key} className={`px-3 py-2 text-right ${k ? tone(r[k]) : "text-white"}`}>{f(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {kis && (kis.roe != null || kis.debtRatio != null) && (
        <div className="grid grid-cols-3 gap-3 pt-1">
          <Stat label="ROE (연간)" value={kis.roe != null ? `${kis.roe.toFixed(1)}%` : "—"} />
          <Stat label="부채비율 (연간)" value={kis.debtRatio != null ? `${kis.debtRatio.toFixed(1)}%` : "—"} />
        </div>
      )}
      {q?.error && !L && <p className="text-[10px] text-gray-600">분기 실적을 불러오지 못해 연간(KIS) 값만 표시합니다 · {q.error}</p>}
    </Section>
  );
}

interface Research { title: string; broker: string; date: string; url: string; pdf: string | null }

function ResearchList({ code }: { code: string }) {
  const [r, setR] = useState<{ items: Research[]; listUrl: string } | null>(null);
  useEffect(() => {
    fetch(`/api/stock-research?code=${code}`, { cache: "no-store" }).then(x => x.json()).then(setR).catch(() => setR(null));
  }, [code]);
  if (!r) return null;
  return (
    <div className="border-t border-navy-border pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-300">최근 증권사 리포트</p>
        <a href={r.listUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-cyan-brand">전체 보기 ›</a>
      </div>
      {r.items.length === 0 ? (
        <p className="text-[11px] text-gray-500">리포트 목록을 가져오지 못했습니다. 전체 보기에서 확인하세요.</p>
      ) : (
        <ul className="divide-y divide-navy-border">
          {r.items.map(i => (
            <li key={i.url} className="py-2">
              <a href={i.pdf ?? i.url} target="_blank" rel="noopener noreferrer" className="block">
                <p className="text-sm text-white leading-snug line-clamp-2">{i.title}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{i.broker} · {i.date}{i.pdf ? " · PDF" : ""}</p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OverviewTab({ d }: { d: Overview }) {
  const q = d.quote, c = d.consensus, f = d.financials, s = d.shortSale;
  const total = c ? c.buy + c.hold + c.sell : 0;
  const donut = total
    ? `conic-gradient(#1D9E75 0 ${(c!.buy / total) * 360}deg, #F59E0B 0 ${((c!.buy + c!.hold) / total) * 360}deg, #E24B4A 0 360deg)`
    : "conic-gradient(rgb(var(--c-navy-border)) 0 360deg)";
  const verdict = !total ? "의견 없음" : c!.buy / total >= 0.7 ? "매수 우세" : c!.sell / total >= 0.3 ? "매도 경계" : "중립";

  return (
    <div className="space-y-4">
      {q && (
        <Section title="종목정보" note={[q.market, q.sector].filter(Boolean).join(" · ")}>
          <div className="grid grid-cols-3 gap-y-5 gap-x-3">
            <Stat label="PER" value={q.per ? `${q.per.toFixed(2)}배` : "—"} />
            <Stat label="PBR" value={q.pbr ? `${q.pbr.toFixed(2)}배` : "—"} />
            <Stat label="EPS" value={q.eps != null ? `${won(q.eps)}원` : "—"} />
            <Stat label="시가총액" value={eok(q.marketCapEok)} />
            <Stat label="외국인 소진율" value={q.foreignRatio != null ? `${q.foreignRatio.toFixed(2)}%` : "—"} />
            <Stat label="거래대금" value={q.valueWon != null ? eok(q.valueWon / 1e8) : "—"} />
          </div>
          {q.high52 && q.low52 && (
            <div>
              <div className="flex justify-between text-[11px] text-gray-500 mb-1.5"><span>52주 최저</span><span>52주 최고</span></div>
              <div className="relative h-1.5 rounded-full bg-navy-border">
                <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-signal-red/60 to-signal-green/60" style={{ width: `${q.pos52 ?? 0}%` }} />
                <div className="absolute -top-1 w-3.5 h-3.5 rounded-full bg-white border-2 border-cyan-brand" style={{ left: `calc(${q.pos52 ?? 0}% - 7px)` }} />
              </div>
              <div className="flex justify-between text-xs text-white num mt-1.5"><span>{won(q.low52)}</span><span>{won(q.high52)}</span></div>
            </div>
          )}
        </Section>
      )}

      <EarningsSection code={d.code} kis={f} />

      {c && (
        <Section title="목표가" note={`증권사 리포트 최근 3개월 ${c.reports}건`}>
          <div className="flex items-center gap-5">
            <div className="relative w-24 h-24 rounded-full shrink-0" style={{ background: donut }}>
              <div className="absolute inset-2.5 rounded-full bg-navy-card flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-white num">{total}</span>
                <span className="text-[10px] text-gray-500">투자의견</span>
              </div>
            </div>
            <div className="space-y-2">
              <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${verdict === "매수 우세" ? "bg-signal-green/15 text-signal-green" : verdict === "매도 경계" ? "bg-signal-red/15 text-signal-red" : "bg-gold/15 text-gold"}`}>{verdict}</span>
              <p className="text-xs text-gray-300 num">
                <span className="text-signal-green">● 매수 {c.buy}</span>　<span className="text-amber-400">● 중립 {c.hold}</span>　<span className="text-signal-red">● 매도 {c.sell}</span>
              </p>
            </div>
          </div>
          <div className="flex justify-between items-end border-t border-navy-border pt-3">
            <div>
              <p className="text-[11px] text-gray-500">평균 목표가</p>
              <p className="text-xl font-bold text-white num">{c.avgTarget ? `${won(c.avgTarget)}원` : "—"}</p>
              {c.minTarget && c.maxTarget && <p className="text-[11px] text-gray-500 num">범위 {won(c.minTarget)} ~ {won(c.maxTarget)}</p>}
            </div>
            <div className="text-right">
              <p className="text-[11px] text-gray-500">현재가 대비</p>
              <p className={`text-xl font-bold num ${tone(c.upsidePct)}`}>{pct(c.upsidePct)}</p>
            </div>
          </div>
          {c.latest.length > 0 && (
            <ul className="text-xs divide-y divide-navy-border">
              {c.latest.map((r, i) => (
                <li key={i} className="flex justify-between py-2">
                  <span className="text-gray-500 num">{ymd(r.date)}</span>
                  <span className="text-gray-300">{r.opinion || "—"}</span>
                  <span className="text-white num">{r.target ? `${won(r.target)}원` : "—"}</span>
                </li>
              ))}
            </ul>
          )}
          <ResearchList code={d.code} />
        </Section>
      )}

      {s && (
        <Section title="공매도" note={ymd(s.date)}>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="공매도 거래량 비중" value={s.ratio != null ? `${s.ratio.toFixed(2)}%` : "—"}
              sub={s.ratioChange2w != null ? `${s.ratioChange2w > 0 ? "+" : ""}${s.ratioChange2w.toFixed(2)}%p (2주)` : undefined}
              subCls={s.ratioChange2w == null ? undefined : s.ratioChange2w > 0 ? "text-signal-red" : "text-signal-green"} />
            <Stat label="공매도 거래대금" value={s.amountWon != null ? eok(s.amountWon / 1e8) : "—"} />
          </div>
        </Section>
      )}

      {d.errors.length > 0 && <p className="text-[10px] text-gray-600 break-all">일부 정보 없음: {d.errors.join(" | ")}</p>}
    </div>
  );
}

function ChartTab({ symbol }: { symbol: string }) {
  const [tf, setTf] = useState<Timeframe>("5m");
  return (
    <section className="card space-y-2">
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {TIMEFRAMES.map(([k, l]) => (
          <button key={k} onClick={() => setTf(k)}
            className={`shrink-0 px-3 py-1 text-xs rounded-lg ${tf === k ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40" : "text-gray-500"}`}>{l}</button>
        ))}
      </div>
      <CandleChart label={symbol} tf={tf} height={340} digits={0} />
    </section>
  );
}

interface Flow {
  foreign: number; institution: number; individual: number | null; invDate: string;
  confirmed?: { foreign: number; institution: number; individual: number };
  foreign5D: number; foreign10D: number; foreign20D: number; institution5D: number; institution10D: number; institution20D: number;
}

function FlowTab({ code, market }: { code: string; market: string }) {
  const [f, setF] = useState<Flow | null>(null);
  const [live, setLive] = useState<{ available: boolean; final?: boolean; asOf?: string; nextSlot?: string | null; foreignEok?: number; institutionEok?: number; globalEok?: number | null; updatedAt?: string; note?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const loadFlow = () => fetch(`/api/stock-investor?code=${code}&market=${market}`, { cache: "no-store" })
    .then(r => r.json()).then(j => { if (!j.error) setF(j); });
  const loadLive = () => fetch(`/api/stock-flow-live?code=${code}`, { cache: "no-store" })
    .then(r => r.json()).then(j => { if (!j.error) setLive(j); }).catch(() => {});
  useEffect(() => {
    setF(null); setLive(null); setLoading(true);
    loadFlow().catch(() => {}).finally(() => setLoading(false));
    loadLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, market]);
  // 장중: 외국계 창구는 30초, 가집계·확정 수급은 2분마다 다시 받는다
  useMarketPoll(loadLive, 30_000);
  useMarketPoll(() => { loadFlow().catch(() => {}); }, 120_000);
  if (loading) return <div className="card h-48 animate-pulse" />;
  if (!f) return <div className="card text-sm text-gray-500 text-center py-10">수급 데이터를 불러올 수 없습니다</div>;
  const c = f.confirmed ?? { foreign: f.foreign, institution: f.institution, individual: f.individual ?? 0 };
  const today = [["외국인", c.foreign], ["기관", c.institution], ["개인", c.individual]] as const;
  const max = Math.max(1, ...today.map(([, v]) => Math.abs(v)));
  const todayYmd = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
  const confirmedToday = f.invDate === todayYmd;
  return (
    <div className="space-y-4">
      {!confirmedToday && live && (
        <Section title="오늘 장중 수급" note="억원 · 추정">
          {(() => {
            // 토스 방식: 외국인은 외국계 창구 실시간, 기관은 거래소 가집계, 개인은 직전 확정치
            const fx = live.final ? { v: live.foreignEok ?? 0, at: "오늘 장마감 확정" } : live.globalEok != null
              ? { v: live.globalEok, at: `오늘 ${live.updatedAt} 기준` }
              : live.available ? { v: live.foreignEok ?? 0, at: `오늘 ${live.asOf} 기준` } : null;
            const inst = live.available ? { v: live.institutionEok ?? 0, at: live.final ? "오늘 장마감 확정" : `오늘 ${live.asOf} 기준${(live.updatedAt ?? "") >= "15:30" ? " · 확정 대기" : ""}` } : null;
            const prevDay = f.invDate ? `${+f.invDate.slice(4, 6)}/${+f.invDate.slice(6, 8)} 확정` : "직전 확정";
            const cols: [string, { v: number; at: string } | null][] = [
              ["외국인", fx], ["기관", inst], ["개인", { v: c.individual, at: prevDay }],
            ];
            return (
              <div className="grid grid-cols-3 gap-3">
                {cols.map(([l, x]) => (
                  <div key={l}>
                    <p className="text-[11px] text-gray-500">{l}</p>
                    <p className={`text-base font-bold num mt-0.5 ${x ? tone(x.v) : "text-gray-600"}`}>{x ? `${x.v > 0 ? "+" : ""}${eok(x.v)}` : "—"}</p>
                    <p className="text-[10px] text-gray-500 num mt-0.5">{x ? x.at : "09:30 첫 집계"}</p>
                  </div>
                ))}
              </div>
            );
          })()}
          <p className="text-[10px] text-gray-600 leading-relaxed">
            외국인은 외국계 증권사 창구 순매수(실시간 근사치), 기관은 거래소 가집계(09:30·10:00·11:20·13:20·14:30){live.nextSlot ? ` · 다음 집계 ${live.nextSlot}` : ""}, 개인은 장중 집계가 없어 직전 거래일 확정치입니다.
          </p>
        </Section>
      )}
      <Section title={confirmedToday ? "투자자별 순매수 (오늘 확정)" : "투자자별 순매수 (직전 거래일 확정)"} note={f.invDate ? `${ymd(f.invDate)} 기준 · 억원` : "억원"}>
        {today.map(([l, v]) => (
          <div key={l}>
            <div className="flex justify-between text-sm mb-1"><span className="text-white">{l}</span><span className={`font-bold num ${tone(v)}`}>{v > 0 ? "+" : ""}{eok(v)}</span></div>
            <div className="h-1.5 bg-navy-border rounded-full overflow-hidden">
              <div className={`h-full ${v >= 0 ? "bg-signal-green" : "bg-signal-red"}`} style={{ width: `${(Math.abs(v) / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </Section>
      <Section title="누적 순매수" note="억원">
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] text-gray-500"><th className="text-left font-normal pb-2" /><th className="font-normal">5일</th><th className="font-normal">10일</th><th className="font-normal">20일</th></tr></thead>
          <tbody className="num">
            {([["외국인", f.foreign5D, f.foreign10D, f.foreign20D], ["기관", f.institution5D, f.institution10D, f.institution20D]] as const).map(([l, a, b, c]) => (
              <tr key={l}><td className="text-white py-1.5">{l}</td>{[a, b, c].map((v, i) => <td key={i} className={`text-center ${tone(v)}`}>{eok(v)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function ListTab({ url, kind }: { url: string; kind: "news" | "dart" }) {
  const [items, setItems] = useState<{ title?: string; report?: string; url: string; source?: string; filer?: string; publishedAt?: string | null; date?: string }[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"rel" | "new">("new");
  useEffect(() => {
    fetch(url, { cache: "no-store" }).then(r => r.json())
      .then(j => { setItems(j.items ?? []); setErr(j.error ?? ""); })
      .finally(() => setLoading(false));
  }, [url]);
  if (loading) return <div className="card h-48 animate-pulse" />;
  if (!items.length) return <div className="card text-sm text-gray-500 text-center py-10">{err || (kind === "news" ? "최근 1주 뉴스가 없습니다" : "최근 6개월 공시가 없습니다")}</div>;
  const shown = kind === "news" && sort === "new"
    ? [...items].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    : items;
  return (
    <div className="space-y-2">
    {kind === "news" && (
      <div className="flex gap-1 justify-end">
        {([["new", "최신순"], ["rel", "관련도순"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSort(k)}
            className={`px-2.5 py-1 text-xs rounded-lg ${sort === k ? "bg-navy-card text-white border border-navy-border" : "text-gray-500"}`}>{l}</button>
        ))}
      </div>
    )}
    <ul className="card !p-0 divide-y divide-navy-border">
      {shown.map(i => (
        <li key={i.url}>
          <a href={i.url} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 hover:bg-white/5">
            <p className="text-sm text-white leading-snug">{i.title ?? i.report}</p>
            <p className="text-[11px] text-gray-500 mt-1">{kind === "news" ? `${i.source ?? ""} · ${relTime(i.publishedAt)}` : `${i.filer ?? ""} · ${i.date}`}</p>
          </a>
        </li>
      ))}
    </ul>
    </div>
  );
}

export default function StockPage({ params }: { params: { code: string } }) {
  const { code } = params;
  const router = useRouter();
  const { user, profile } = useAuth();
  const [d, setD] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("개요");
  const [fav, setFav] = useState(false);

  useEffect(() => {
    fetch(`/api/stock-overview?code=${code}`, { cache: "no-store" })
      .then(r => r.json()).then(j => { setD(j.error ? null : j); if (!j.error) logActivity("view", { code, name: j.name }); }).finally(() => setLoading(false));
  }, [code]);
  // 장중 현재가 15초마다 갱신(실패하면 기존 값 유지)
  useMarketPoll(() => {
    if (krSession().key === "closed") return; // 08~20시(KRX+NXT)에만
    fetch(`/api/stock-overview?code=${code}&quote=1`, { cache: "no-store" })
      .then(r => r.json()).then(j => { if (!j.error && j.quote) setD(prev => (prev ? { ...prev, quote: { ...prev.quote, ...j.quote }, nxt: j.nxt ?? null, session: j.session } : prev)); }).catch(() => {});
  }, 15_000, { krxOnly: false, enabled: true });

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb || !user) { setFav(false); return; }
    sb.from("watchlist").select("code").eq("user_id", user.id).eq("code", code).maybeSingle().then(({ data }) => setFav(!!data));
  }, [user, code]);

  const toggleFav = async () => {
    const sb = getBrowserSupabase();
    if (!user || !profile) { router.push("/me"); return; }
    if (!sb || !d) return;
    const { error } = fav
      ? await sb.from("watchlist").delete().eq("user_id", user.id).eq("code", code)
      : await sb.from("watchlist").insert({ user_id: user.id, code, name: d.name, market: d.marketCode });
    if (!error) { setFav(!fav); logActivity("watch", { code, name: d.name, on: !fav }); }
  };

  const q = d?.quote;
  return (
    <main className="max-w-3xl mx-auto animate-fade-in">
      <div className="sticky z-20 bg-navy/95 backdrop-blur border-b border-navy-border px-4 pt-3" style={{ top: "var(--hdr, 115px)" }}>
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} aria-label="뒤로" className="-ml-1 p-1 text-gray-300"><FiChevronLeft size={22} /></button>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-white truncate">{d?.name ?? code}</p>
            {q?.price != null && (
              <p className="text-sm num">
                <span className="text-white font-semibold">{won(q.price)}원</span>{" "}
                <span className={tone(q.changePct)}>{q.changePct != null && q.changePct > 0 ? "▲" : q.changePct != null && q.changePct < 0 ? "▼" : ""} {won(Math.abs(q.change ?? 0))} ({pct(q.changePct, 2)})</span>
                {d?.session && <span className="ml-1.5 text-[10px] text-gray-500">{d.session.key === "regular" ? "KRX 정규장" : "KRX 종가"}</span>}
              </p>
            )}
            {d?.nxt && d.session && d.session.key !== "regular" && (
              <p className="text-xs num">
                <span className="text-purple-300 font-semibold">{d.session.key === "nxt-pre" || d.session.key === "auction-open" ? "NXT 프리마켓" : d.session.key === "nxt-after" ? "애프터마켓" : "애프터 종가"}</span>{" "}
                <span key={d.nxt.price} className="text-white font-semibold rounded animate-tick">{won(d.nxt.price)}원</span>{" "}
                <span className={tone(d.nxt.pct)}>{d.nxt.pct > 0 ? "+" : ""}{d.nxt.pct.toFixed(2)}%</span>
              </p>
            )}
          </div>
          {d && <AddToPortfolio code={code} name={d.name} market={d.marketCode} price={q?.price} />}
          <button onClick={toggleFav} aria-label="관심종목"
            className={`w-10 h-10 rounded-full flex items-center justify-center ${fav ? "bg-pink-500/15 text-pink-400" : "bg-navy-card text-gray-500"}`}>
            <FiHeart size={18} className={fav ? "fill-current" : ""} />
          </button>
        </div>
        <div className="flex gap-5 mt-3 overflow-x-auto scrollbar-none">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`shrink-0 pb-2.5 text-sm font-semibold border-b-2 ${tab === t ? "text-white border-white" : "text-gray-500 border-transparent"}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="card h-40 animate-pulse" />)}</div>
        ) : !d ? (
          <div className="card text-center text-sm text-gray-500 py-10">종목 정보를 불러올 수 없습니다</div>
        ) : tab === "개요" ? <OverviewTab d={d} />
          : tab === "차트" ? <ChartTab symbol={`${code}.${d.marketCode}`} />
          : tab === "수급" ? <FlowTab code={code} market={d.marketCode} />
          : tab === "레이더" ? <RadarReport code={code} name={d.name} market={d.marketCode} />
          : tab === "뉴스" ? <ListTab key="news" kind="news" url={`/api/stock-news?name=${encodeURIComponent(d.name)}`} />
          : <ListTab key="dart" kind="dart" url={`/api/stock-disclosures?code=${code}`} />}
      </div>
    </main>
  );
}
