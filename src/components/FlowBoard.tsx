"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from "recharts";
import { useMarketPoll } from "@/lib/useMarketPoll";

type Mk = "KOSPI" | "KOSDAQ";
interface Core { foreign: number; institution: number; individual: number }
interface Board {
  investors: Record<Mk, (Core & { date: string; live: boolean; detail: { label: string; value: number }[] }) | null>;
  daily: Record<Mk, (Core & { date: string })[]>;
  sectors: (Core & { code: string; name: string; date: string })[];
  sectorsKQ?: (Core & { code: string; name: string; date: string })[];
  intraday: Partial<Record<Mk, (Core & { hm: string })[]>>;
  futures?: (Core & { foreignQty: number; institutionQty: number; individualQty: number }) | null;
  asOf: string;
  errors: string[];
}

// 거래주체 색: 등락 색(초록/빨강)과 겹치지 않게
const C = { foreign: "#4F8BFF", institution: "#F5B800", individual: "#B48CFF" } as const;
const LABEL = { foreign: "외국인", institution: "기관", individual: "개인" } as const;
const KEYS = ["foreign", "institution", "individual"] as const;

const fmt = (v: number) => {
  const a = Math.abs(v), s = v > 0 ? "+" : v < 0 ? "-" : "";
  if (a >= 10000) return `${s}${(a / 10000).toFixed(2)}조`;
  if (a > 0 && a < 1) return `${s}${Math.round(a * 10000).toLocaleString("ko-KR")}만`;
  return `${s}${(a >= 100 ? Math.round(a) : Math.round(a * 10) / 10).toLocaleString("ko-KR")}억`;
};
const tone = (v: number) => (v > 0 ? "text-signal-green" : v < 0 ? "text-signal-red" : "text-gray-400");
const md = (d: string) => `${+d.slice(4, 6)}/${+d.slice(6, 8)}`;

function Card({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-white">{title}</h2>
        {note && <span className="text-[11px] text-gray-500 num text-right">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Legend() {
  return (
    <div className="flex gap-3 text-[11px] text-gray-400">
      {KEYS.map(k => <span key={k} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C[k] }} />{LABEL[k]}</span>)}
    </div>
  );
}

const tip = {
  contentStyle: { background: "#0B1430", border: "1px solid #1E2A4A", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#9CA3AF" },
  formatter: (v: unknown, n: unknown) => [fmt(Number(v)), LABEL[String(n) as keyof typeof LABEL] ?? String(n)] as [string, string],
};

interface SE {
  period: string | null; count: number; note?: string;
  total?: { sales: number; op: number; salesYoY: number | null; opYoY: number | null; margin: number | null };
  stocks: { code: string; name: string; pct: number; latest: { period: string; prelim?: boolean; sales: number | null; op: number | null; salesYoY: number | null; opYoY: number | null } | null }[];
}
// 실적 금액은 부호 없이 (적자만 -)
const won = (v: number) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}조` : `${v.toLocaleString("ko-KR")}억`);
const pctTxt = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);

// 업종을 누르면: 히트맵과 같은 업종 분류의 시총 상위 종목 최근 분기 실적(DART, 잠정 포함)
function SectorEarnings({ sector, market }: { sector: string; market: Mk }) {
  const [d, setD] = useState<SE | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/sector-earnings?market=${market}&sector=${encodeURIComponent(sector)}`, { cache: "no-store" })
      .then(r => r.json()).then(setD).catch(() => setD(null)).finally(() => setLoading(false));
  }, [sector, market]);
  if (loading) return <div className="py-2 text-xs text-gray-500 flex items-center gap-2"><span className="w-3 h-3 border border-gray-600 border-t-cyan-brand rounded-full animate-spin" />{sector} 실적 불러오는 중… (처음엔 10~20초)</div>;
  if (!d || !d.stocks?.length) return <div className="py-2 text-xs text-gray-500">{d?.note ?? "실적을 불러오지 못했습니다"}</div>;
  return (
    <div className="space-y-2.5">
      {d.total && d.period && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-xs font-semibold text-white">{d.period} 업종 합계 <span className="text-gray-500 font-normal">(상위 {d.count}종목)</span></span>
          <span className="text-[11px] text-gray-400 num">매출 {won(d.total.sales)} <span className={tone(d.total.salesYoY ?? 0)}>{pctTxt(d.total.salesYoY)}</span></span>
          <span className="text-[11px] text-gray-400 num">영업이익 {won(d.total.op)} <span className={tone(d.total.opYoY ?? 0)}>{pctTxt(d.total.opYoY)}</span></span>
          {d.total.margin != null && <span className="text-[11px] text-gray-400 num">이익률 {d.total.margin}%</span>}
        </div>
      )}
      <table className="w-full text-[11px]">
        <thead><tr className="text-gray-500"><th className="text-left font-normal pb-1">종목</th><th className="text-right font-normal pb-1">분기</th><th className="text-right font-normal pb-1">매출</th><th className="text-right font-normal pb-1">영업이익</th><th className="text-right font-normal pb-1">YoY</th></tr></thead>
        <tbody className="num">
          {d.stocks.map(x => (
            <tr key={x.code} className="border-t border-navy-border/40">
              <td className="py-1.5"><Link href={`/stock/${x.code}`} className="text-white hover:text-cyan-brand">{x.name}</Link></td>
              <td className="py-1.5 text-right text-gray-400">{x.latest ? `${x.latest.period.slice(2)}${x.latest.prelim ? "*" : ""}` : "—"}</td>
              <td className="py-1.5 text-right text-gray-300">{x.latest?.sales != null ? won(x.latest.sales) : "—"}</td>
              <td className={`py-1.5 text-right font-semibold ${tone(x.latest?.op ?? 0)}`}>{x.latest?.op != null ? won(x.latest.op) : "—"}</td>
              <td className={`py-1.5 text-right ${tone(x.latest?.opYoY ?? 0)}`}>{pctTxt(x.latest?.opYoY)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-600">* 잠정실적 · YoY는 영업이익 전년 동기 대비 · 출처 DART · 종목 이름을 누르면 상세로 이동</p>
    </div>
  );
}

interface SF {
  asOf: string; note?: string;
  total?: { foreign: number; institution: number; pct: number | null; up: number; down: number };
  stocks: { code: string; name: string; price: number; pct: number; foreign: number | null; foreignBasis: string | null; institution: number | null; instBasis: string | null }[];
}

// 업종 동향: 종목별 현재가·등락률·외국인/기관 오늘 순매수
function SectorFlow({ sector, market }: { sector: string; market: Mk }) {
  const [d, setD] = useState<SF | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => fetch(`/api/sector-flow?market=${market}&sector=${encodeURIComponent(sector)}`, { cache: "no-store" })
    .then(r => r.json()).then(j => setD(j)).catch(() => {}).finally(() => setLoading(false)), [sector, market]);
  useEffect(() => { setLoading(true); load(); }, [load]);
  useMarketPoll(load, 60_000);
  if (loading) return <p className="text-xs text-gray-500 flex items-center gap-2 py-2"><span className="w-3 h-3 border border-gray-600 border-t-cyan-brand rounded-full animate-spin" />{sector} 종목 동향 불러오는 중…</p>;
  if (!d?.stocks?.length) return <p className="text-xs text-gray-500 py-2">{d?.note ?? "동향을 불러오지 못했습니다"}</p>;
  const basis = d.stocks.find(x => x.foreignBasis)?.foreignBasis, ibasis = d.stocks.find(x => x.instBasis)?.instBasis;
  return (
    <div className="space-y-2">
      {d.total && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400 num">
          {d.total.pct != null && <span>업종(시총가중) <span className={`font-semibold ${tone(d.total.pct)}`}>{d.total.pct > 0 ? "+" : ""}{d.total.pct}%</span></span>}
          <span>상승 <span className="text-signal-green">{d.total.up}</span> · 하락 <span className="text-signal-red">{d.total.down}</span></span>
          <span>외국인 합 <span className={tone(d.total.foreign)}>{fmt(d.total.foreign)}</span></span>
          <span>기관 합 <span className={tone(d.total.institution)}>{fmt(d.total.institution)}</span></span>
        </div>
      )}
      <table className="w-full text-[11px]">
        <thead><tr className="text-gray-500">
          <th className="text-left font-normal pb-1">종목</th><th className="text-right font-normal pb-1">현재가</th><th className="text-right font-normal pb-1">등락</th>
          <th className="text-right font-normal pb-1" style={{ color: C.foreign }}>외국인</th><th className="text-right font-normal pb-1" style={{ color: C.institution }}>기관</th>
        </tr></thead>
        <tbody className="num">
          {d.stocks.map(x => (
            <tr key={x.code} className="border-t border-navy-border/40">
              <td className="py-1.5"><Link href={`/stock/${x.code}`} className="text-white hover:text-cyan-brand">{x.name}</Link></td>
              <td className="py-1.5 text-right text-gray-300">{x.price.toLocaleString("ko-KR")}</td>
              <td className={`py-1.5 text-right font-semibold ${tone(x.pct)}`}>{x.pct > 0 ? "+" : ""}{x.pct.toFixed(2)}%</td>
              <td className={`py-1.5 text-right ${x.foreign == null ? "text-gray-600" : tone(x.foreign)}`}>{x.foreign == null ? "—" : fmt(x.foreign)}</td>
              <td className={`py-1.5 text-right ${x.institution == null ? "text-gray-600" : tone(x.institution)}`}>{x.institution == null ? "—" : fmt(x.institution)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-600">{d.asOf} 기준 · 외국인 {basis === "창구" ? "외국계 창구 실시간" : basis ?? "—"} · 기관 {ibasis ?? "가집계 전"}{ibasis?.includes("가집계") && d.asOf >= "15:30" ? " (장 마감 후 확정치 집계 대기)" : ""} · 시총 상위 {d.stocks.length}종목 · 1분마다 갱신</p>
    </div>
  );
}

// 업종 행을 펼치면: 우상단 토글로 동향(기본) / 실적
function SectorDetail({ sector, market }: { sector: string; market: Mk }) {
  const [view, setView] = useState<"flow" | "earn">("flow");
  return (
    <div className="rounded-xl bg-navy-sub/50 border border-navy-border/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white">{sector}</span>
        <div className="flex rounded-lg border border-navy-border overflow-hidden text-[11px]">
          {([["flow", "동향"], ["earn", "실적"]] as const).map(([k, l]) => (
            <button key={k} onClick={e => { e.stopPropagation(); setView(k); }}
              className={`px-3 py-1 ${view === k ? "bg-cyan-brand/20 text-cyan-brand font-semibold" : "text-gray-500"}`}>{l}</button>
          ))}
        </div>
      </div>
      {view === "flow" ? <SectorFlow sector={sector} market={market} /> : <SectorEarnings sector={sector} market={market} />}
    </div>
  );
}

// 증시 > 국내 > 수급: market 은 코스피 / 코스닥 / 코스피200(선물)
export default function FlowBoard({ market = "KOSPI" }: { market?: Mk | "K200" }) {
  const mk: Mk = market === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
  const [b, setB] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [sectorSort, setSectorSort] = useState<"smart" | "foreign" | "institution" | "individual">("smart");
  const [openSector, setOpenSector] = useState<string | null>(null);

  const load = useCallback(() => fetch("/api/flow-board", { cache: "no-store" })
    .then(r => r.json()).then(j => { if (j && !j.error) setB(j); }).catch(() => {}).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  useMarketPoll(load, 60_000);

  if (loading) return <div className="space-y-4">{[0, 1, 2].map(i => <div key={i} className="card h-48 animate-pulse" />)}</div>;
  if (!b) return <div className="card text-sm text-gray-500 text-center py-10">매매동향을 불러오지 못했습니다</div>;

  const inv = b.investors[mk];
  const max = inv ? Math.max(1, ...KEYS.map(k => Math.abs(inv[k]))) : 1;
  const intra = b.intraday[mk] ?? [];
  const daily = b.daily[mk] ?? [];
  const sectors = [...(mk === "KOSDAQ" ? b.sectorsKQ ?? [] : b.sectors)].sort((x, y) =>
    sectorSort === "smart" ? (y.foreign + y.institution) - (x.foreign + x.institution) : y[sectorSort] - x[sectorSort]);
  const sMax = Math.max(1, ...sectors.flatMap(s => KEYS.map(k => Math.abs(s[k]))));

  return (
    <div className="space-y-4">
      <p className="text-right text-[11px] text-gray-500 num">{b.asOf} 갱신 · 장중 1분마다</p>

      {market === "K200" ? (
        b.futures ? (
          <Card title="코스피200 선물 투자자별 순매수" note="오늘 · 억원 (계약)">
            <div className="grid grid-cols-3 gap-3">
              {KEYS.map(k => {
                const v = b.futures![k], q = b.futures![`${k}Qty` as "foreignQty"];
                return (
                  <div key={k} className="rounded-xl bg-navy-sub/60 p-3">
                    <p className="text-[11px] text-gray-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: C[k] }} />{LABEL[k]}</p>
                    <p className={`text-base font-bold num mt-1 ${tone(v)}`}>{fmt(v)}</p>
                    <p className={`text-[11px] num ${tone(q)}`}>{q > 0 ? "+" : ""}{q.toLocaleString("ko-KR")}계약</p>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-600">선물은 외국인 포지션이 현물 방향을 미리 보여주는 경우가 많아 함께 보면 좋습니다 · 출처 한국투자증권</p>
          </Card>
        ) : (
          <div className="card text-sm text-gray-500 text-center py-10">코스피200 선물 수급을 불러오지 못했습니다{b.errors.length ? <span className="block text-[10px] text-gray-600 mt-1">{b.errors.filter(e => e.startsWith("선물")).join(" ")}</span> : null}</div>
        )
      ) : (<>

      {/* ① 거래주체별 */}
      <Card title="거래주체별 순매수" note={inv ? `${inv.live ? "오늘 장중 잠정" : `${md(inv.date)} 확정`} · 억원` : undefined}>
        {!inv ? <p className="text-xs text-gray-500">데이터가 없습니다</p> : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {KEYS.map(k => (
                <div key={k} className="rounded-xl bg-navy-sub/60 p-3">
                  <p className="text-[11px] text-gray-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: C[k] }} />{LABEL[k]}</p>
                  <p className={`text-base sm:text-lg font-bold num mt-1 ${tone(inv[k])}`}>{fmt(inv[k])}</p>
                  <div className="h-1.5 bg-navy-border rounded-full overflow-hidden mt-2">
                    <div className={`h-full ${inv[k] >= 0 ? "bg-signal-green" : "bg-signal-red"}`} style={{ width: `${(Math.abs(inv[k]) / max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {inv.detail.length > 0 && (
              <div>
                <p className="text-[11px] text-gray-500 mb-1.5">기관·기타 세부</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {inv.detail.map(d => (
                    <div key={d.label} className="rounded-lg bg-navy-sub/40 px-2 py-1.5">
                      <p className="text-[10px] text-gray-500">{d.label}</p>
                      <p className={`text-xs font-semibold num ${tone(d.value)}`}>{fmt(d.value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ② 시간별 */}
      <Card title="시간별 누적 순매수 (오늘)" note={intra.length ? `${intra[0].hm} ~ ${intra[intra.length - 1].hm}` : undefined}>
        {intra.length >= 2 ? (
          <>
            <Legend />
            <div className="h-56 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={intra} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#1E2A4A" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="hm" tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={false} width={44}
                    tickFormatter={(v: number) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}조` : `${v}`)} />
                  <ReferenceLine y={0} stroke="#374151" />
                  <Tooltip {...tip} />
                  {KEYS.map(k => <Line key={k} type="monotone" dataKey={k} stroke={C[k]} strokeWidth={2} dot={false} isAnimationActive={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-500 leading-relaxed">
            장중(09:00~15:30)에 1분 간격으로 시장 전체 순매수를 기록해 흐름을 그립니다. 기록이 쌓이면 여기에 시간대별 그래프가 나타납니다.
          </p>
        )}
      </Card>

      {/* ③ 섹터별 */}
      <Card title={`업종별 순매수 (${mk === "KOSDAQ" ? "코스닥" : "코스피"}) · 누르면 종목별 동향`} note={sectors[0] ? `${md(sectors[0].date)} 기준 · 억원` : undefined}>
        {!sectors.length ? <p className="text-xs text-gray-500">업종별 데이터를 불러오지 못했습니다</p> : (
          <>
            <div className="flex gap-1 overflow-x-auto scrollbar-none">
              {([["smart", "외국인+기관"], ["foreign", "외국인"], ["institution", "기관"], ["individual", "개인"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setSectorSort(k)}
                  className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] ${sectorSort === k ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40" : "text-gray-500"}`}>{l} 순</button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[340px]">
                <thead>
                  <tr className="text-[11px] text-gray-500">
                    <th className="text-left font-normal py-1.5">업종</th>
                    {KEYS.map(k => <th key={k} className="text-right font-normal py-1.5" style={{ color: C[k] }}>{LABEL[k]}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-border/60">
                  {sectors.map(s => (
                    <Fragment key={s.code}>
                    <tr onClick={() => setOpenSector(openSector === s.name ? null : s.name)} className="cursor-pointer hover:bg-white/5">
                      <td className="py-2 text-white whitespace-nowrap pr-2">
                        <span className={`inline-block w-3 text-gray-500 transition-transform ${openSector === s.name ? "rotate-90" : ""}`}>›</span>{s.name}
                      </td>
                      {KEYS.map(k => (
                        <td key={k} className="py-2 pl-2 w-[27%]">
                          <div className="flex flex-col items-end gap-1">
                            <span className={`num font-semibold ${tone(s[k])}`}>{fmt(s[k])}</span>
                            <div className="w-full h-1 bg-navy-border/60 rounded-full overflow-hidden flex justify-end">
                              <div className="h-full rounded-full" style={{ width: `${(Math.abs(s[k]) / sMax) * 100}%`, background: s[k] >= 0 ? "#1D9E75" : "#E24B4A" }} />
                            </div>
                          </div>
                        </td>
                      ))}
                    </tr>
                    {openSector === s.name && (
                      <tr><td colSpan={4} className="pb-3"><SectorDetail sector={s.name} market={mk} /></td></tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* ④ 일별 */}
      <Card title="일별 순매수 추이" note={daily.length ? `최근 ${daily.length}거래일 · 억원` : undefined}>
        {daily.length >= 2 ? (
          <>
            <Legend />
            <div className="h-52 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily.map(d => ({ ...d, d: md(d.date) }))} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#1E2A4A" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="d" tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={false} width={44}
                    tickFormatter={(v: number) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}조` : `${v}`)} />
                  <ReferenceLine y={0} stroke="#374151" />
                  <Tooltip {...tip} />
                  {KEYS.map(k => <Line key={k} type="monotone" dataKey={k} stroke={C[k]} strokeWidth={2.2} dot={{ r: 2.5, fill: C[k], strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : <p className="text-xs text-gray-500">일별 데이터가 부족합니다</p>}
      </Card>
      </>)}

      <p className="text-[10px] text-gray-600 text-center">
        출처: 한국투자증권 Open API(시장·업종별 투자자 매매동향) · 장중 값은 잠정치 · 종목별 순위는 매매동향 탭 &gt; 투자자 동향
        {b.errors.length > 0 && <span className="block mt-1 break-all">{b.errors.join(" | ")}</span>}
      </p>
    </div>
  );
}
