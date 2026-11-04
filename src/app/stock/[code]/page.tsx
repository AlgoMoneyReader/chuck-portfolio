"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FiChevronLeft, FiHeart } from "react-icons/fi";
import { AreaChart, Area, BarChart, Bar, Legend, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { relTime } from "@/lib/time";

interface Overview {
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

const TABS = ["개요", "차트", "수급", "뉴스", "공시"] as const;
type Tab = typeof TABS[number];

const won = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("ko-KR"));
const eok = (n: number | null | undefined) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  return a >= 10000 ? `${(n / 10000).toFixed(a >= 100000 ? 0 : 1)}조` : `${Math.round(n).toLocaleString("ko-KR")}억`;
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

interface QRow { period: string; sales: number | null; op: number | null; net: number | null; salesYoY: number | null; opYoY: number | null; netYoY: number | null }
interface ARow { year: number; sales: number | null; op: number | null; net: number | null }

function EarningsSection({ code, kis }: { code: string; kis: Overview["financials"] }) {
  const [q, setQ] = useState<{ quarters: QRow[]; annual: ARow[]; latest: QRow | null; error?: string } | null>(null);
  const [mode, setMode] = useState<"q" | "y">("q");
  useEffect(() => {
    fetch(`/api/stock-quarterly?code=${code}`, { cache: "no-store" }).then(r => r.json()).then(setQ).catch(() => setQ(null));
  }, [code]);
  const L = q?.latest;
  const label = L ? `${L.period.slice(0, 4)}년 ${L.period.slice(-2, -1)}분기` : null;
  const chart = mode === "q"
    ? (q?.quarters ?? []).map(r => ({ name: r.period.slice(2).replace(".", "."), 매출: r.sales, 영업이익: r.op }))
    : (q?.annual ?? []).map(r => ({ name: String(r.year), 매출: r.sales, 영업이익: r.op }));

  if (!L && !kis) return null;
  return (
    <Section title="실적" note={L ? `${label} · DART 정기보고서` : kis?.period ? `연간 · 결산 ${ymd(kis.period)}` : undefined}>
      {L ? (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="매출" value={eok(L.sales)} sub={`${pct(L.salesYoY)} YoY`} subCls={tone(L.salesYoY)} />
          <Stat label="영업이익" value={eok(L.op)} sub={`${pct(L.opYoY)} YoY`} subCls={tone(L.opYoY)} />
          <Stat label="순이익" value={eok(L.net)} sub={`${pct(L.netYoY)} YoY`} subCls={tone(L.netYoY)} />
        </div>
      ) : kis && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="매출" value={eok(kis.sales)} sub={`${pct(kis.salesYoY)} YoY`} subCls={tone(kis.salesYoY)} />
          <Stat label="영업이익" value={eok(kis.opProfit)} sub={`${pct(kis.opProfitYoY)} YoY`} subCls={tone(kis.opProfitYoY)} />
          <Stat label="순이익" value={eok(kis.netIncome)} sub={`${pct(kis.netIncomeYoY)} YoY`} subCls={tone(kis.netIncomeYoY)} />
        </div>
      )}
      {kis && (kis.roe != null || kis.debtRatio != null) && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="ROE (연간)" value={kis.roe != null ? `${kis.roe.toFixed(1)}%` : "—"} />
          <Stat label="부채비율 (연간)" value={kis.debtRatio != null ? `${kis.debtRatio.toFixed(1)}%` : "—"} />
        </div>
      )}
      {chart.length > 1 && (
        <>
          <div className="flex gap-1">
            {([["q", "분기"], ["y", "연간"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)}
                className={`px-3 py-1 text-xs rounded-full ${mode === k ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40" : "text-gray-500"}`}>{l}</button>
            ))}
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A2545" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} width={48} tickFormatter={v => eok(Number(v))} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "#0D1530", border: "1px solid #1A2545", borderRadius: 8, fontSize: 12 }}
                  formatter={(v, n) => [eok(Number(v)), n as string]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="매출" fill="#2563FF" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="영업이익" fill="#1D9E75" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      {q?.error && !L && <p className="text-[10px] text-gray-600">분기 실적 없음: {q.error}</p>}
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
    : "conic-gradient(#1A2545 0 360deg)";
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

const RANGES = [["1d", "1일"], ["5d", "5일"], ["1mo", "1개월"], ["3mo", "3개월"], ["1y", "1년"]] as const;

function ChartTab({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<string>("1d");
  const [data, setData] = useState<{ date: string; close: number }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/chart-data?label=${encodeURIComponent(symbol)}&range=${range}`, { cache: "no-store" })
      .then(r => r.json()).then(j => setData(j.data ?? [])).catch(() => setData([])).finally(() => setLoading(false));
  }, [symbol, range]);
  const up = data.length > 1 && data[data.length - 1].close >= data[0].close;
  const color = up ? "#1D9E75" : "#E24B4A";
  return (
    <section className="card space-y-3">
      <div className="flex gap-1">
        {RANGES.map(([k, l]) => (
          <button key={k} onClick={() => setRange(k)}
            className={`px-3 py-1 text-xs rounded-full ${range === k ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40" : "text-gray-500"}`}>{l}</button>
        ))}
      </div>
      <div className="h-72">
        {loading ? <div className="h-full bg-navy-border/30 rounded-xl animate-pulse" /> : !data.length ? (
          <p className="h-full flex items-center justify-center text-sm text-gray-500">차트 데이터를 불러올 수 없습니다</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.25} /><stop offset="95%" stopColor={color} stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2545" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} width={56}
                tickFormatter={v => v.toLocaleString("ko-KR")} />
              <Tooltip contentStyle={{ background: "#0D1530", border: "1px solid #1A2545", borderRadius: 8, fontSize: 12 }}
                formatter={v => [`${Number(v).toLocaleString("ko-KR")}원`, "종가"]} />
              <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill="url(#sg)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

interface Flow {
  foreign: number; institution: number; individual: number; invDate: string;
  foreign5D: number; foreign10D: number; foreign20D: number; institution5D: number; institution10D: number; institution20D: number;
}

function FlowTab({ code, market }: { code: string; market: string }) {
  const [f, setF] = useState<Flow | null>(null);
  const [live, setLive] = useState<{ available: boolean; asOf?: string; foreignEok?: number; institutionEok?: number; note?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`/api/stock-investor?code=${code}&market=${market}`, { cache: "no-store" })
      .then(r => r.json()).then(j => setF(j.error ? null : j)).finally(() => setLoading(false));
    fetch(`/api/stock-flow-live?code=${code}`, { cache: "no-store" }).then(r => r.json()).then(setLive).catch(() => setLive(null));
  }, [code, market]);
  if (loading) return <div className="card h-48 animate-pulse" />;
  if (!f) return <div className="card text-sm text-gray-500 text-center py-10">수급 데이터를 불러올 수 없습니다</div>;
  const today = [["외국인", f.foreign], ["기관", f.institution], ["개인", f.individual]] as const;
  const max = Math.max(1, ...today.map(([, v]) => Math.abs(v)));
  const todayYmd = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
  const confirmedToday = f.invDate === todayYmd;
  return (
    <div className="space-y-4">
      {!confirmedToday && live && (
        <Section title="오늘 장중 수급" note={live.available ? `${live.asOf} 가집계 · 추정 · 억원` : undefined}>
          {live.available ? (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="외국인" value={`${(live.foreignEok ?? 0) > 0 ? "+" : ""}${eok(live.foreignEok)}`} subCls={tone(live.foreignEok)} sub={(live.foreignEok ?? 0) >= 0 ? "순매수" : "순매도"} />
              <Stat label="기관" value={`${(live.institutionEok ?? 0) > 0 ? "+" : ""}${eok(live.institutionEok)}`} subCls={tone(live.institutionEok)} sub={(live.institutionEok ?? 0) >= 0 ? "순매수" : "순매도"} />
            </div>
          ) : (
            <p className="text-xs text-gray-500">{live.note ?? "장중 가집계를 불러오지 못했습니다"}</p>
          )}
          <p className="text-[10px] text-gray-600">거래소 가집계(09:30·10:00·11:20·13:20·14:30)를 현재가로 환산한 추정치 · 확정값은 장 마감 후</p>
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
      .then(r => r.json()).then(j => setD(j.error ? null : j)).finally(() => setLoading(false));
  }, [code]);

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
    if (!error) setFav(!fav);
  };

  const q = d?.quote;
  return (
    <main className="max-w-3xl mx-auto animate-fade-in">
      <div className="sticky top-14 z-20 bg-navy/95 backdrop-blur border-b border-navy-border px-4 pt-3">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} aria-label="뒤로" className="-ml-1 p-1 text-gray-300"><FiChevronLeft size={22} /></button>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-white truncate">{d?.name ?? code}</p>
            {q?.price != null && (
              <p className="text-sm num">
                <span className="text-white font-semibold">{won(q.price)}원</span>{" "}
                <span className={tone(q.changePct)}>{q.changePct != null && q.changePct > 0 ? "▲" : q.changePct != null && q.changePct < 0 ? "▼" : ""} {won(Math.abs(q.change ?? 0))} ({pct(q.changePct, 2)})</span>
              </p>
            )}
          </div>
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
          : tab === "뉴스" ? <ListTab key="news" kind="news" url={`/api/stock-news?name=${encodeURIComponent(d.name)}`} />
          : <ListTab key="dart" kind="dart" url={`/api/stock-disclosures?code=${code}`} />}
      </div>
    </main>
  );
}
