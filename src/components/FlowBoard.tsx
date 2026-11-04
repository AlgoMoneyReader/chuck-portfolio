"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from "recharts";
import { useMarketPoll } from "@/lib/useMarketPoll";

type Mk = "KOSPI" | "KOSDAQ";
interface Core { foreign: number; institution: number; individual: number }
interface Board {
  investors: Record<Mk, (Core & { date: string; live: boolean; detail: { label: string; value: number }[] }) | null>;
  daily: Record<Mk, (Core & { date: string })[]>;
  sectors: (Core & { code: string; name: string; date: string })[];
  intraday: Partial<Record<Mk, (Core & { hm: string })[]>>;
  asOf: string;
  errors: string[];
}

// 거래주체 색: 등락 색(초록/빨강)과 겹치지 않게
const C = { foreign: "#4F8BFF", institution: "#F5B800", individual: "#B48CFF" } as const;
const LABEL = { foreign: "외국인", institution: "기관", individual: "개인" } as const;
const KEYS = ["foreign", "institution", "individual"] as const;

const fmt = (v: number) => {
  const a = Math.abs(v), s = v > 0 ? "+" : v < 0 ? "-" : "";
  return a >= 10000 ? `${s}${(a / 10000).toFixed(2)}조` : `${s}${a.toLocaleString("ko-KR")}억`;
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

export default function FlowBoard() {
  const [mk, setMk] = useState<Mk>("KOSPI");
  const [b, setB] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [sectorSort, setSectorSort] = useState<"smart" | "foreign" | "institution" | "individual">("smart");

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
  const sectors = [...b.sectors].sort((x, y) =>
    sectorSort === "smart" ? (y.foreign + y.institution) - (x.foreign + x.institution) : y[sectorSort] - x[sectorSort]);
  const sMax = Math.max(1, ...sectors.flatMap(s => KEYS.map(k => Math.abs(s[k]))));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(["KOSPI", "KOSDAQ"] as const).map(m => (
          <button key={m} onClick={() => setMk(m)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold ${mk === m ? "bg-white text-navy" : "bg-navy-card text-gray-400 border border-navy-border"}`}>{m === "KOSPI" ? "코스피" : "코스닥"}</button>
        ))}
        <span className="ml-auto text-[11px] text-gray-500 num">{b.asOf} 갱신 · 장중 1분마다</span>
      </div>

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
      <Card title="업종별 순매수 (코스피)" note={sectors[0] ? `${md(sectors[0].date)} 기준 · 억원` : undefined}>
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
                    <tr key={s.code}>
                      <td className="py-2 text-white whitespace-nowrap pr-2">{s.name}</td>
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
                <BarChart data={daily.map(d => ({ ...d, d: md(d.date) }))} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#1E2A4A" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="d" tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={false} width={44}
                    tickFormatter={(v: number) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}조` : `${v}`)} />
                  <ReferenceLine y={0} stroke="#374151" />
                  <Tooltip {...tip} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  {KEYS.map(k => <Bar key={k} dataKey={k} fill={C[k]} radius={[2, 2, 0, 0]} isAnimationActive={false} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : <p className="text-xs text-gray-500">일별 데이터가 부족합니다</p>}
      </Card>

      <p className="text-[10px] text-gray-600 text-center">
        출처: 한국투자증권 Open API(시장·업종별 투자자 매매동향) · 장중 값은 잠정치 · 종목별 순위는 아래 시장 동향 &gt; 투자자 동향
        {b.errors.length > 0 && <span className="block mt-1 break-all">{b.errors.join(" | ")}</span>}
      </p>
    </div>
  );
}
