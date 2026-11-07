import { NextResponse } from "next/server";
import { adminDb, claim, getState, pushReady, sendTo, setState, subsWhere, type SubRow } from "@/lib/push";
import { MARKETS, clockOf } from "@/lib/marketClock";
import { yahooDaily } from "@/lib/yahooDaily";
import { naverRealtime } from "@/lib/krLive";
import { holidayOn } from "@/lib/marketHolidays";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";
export const maxDuration = 30;

// Supabase pg_cron 이 5분마다 부른다 (supabase/push.sql).
// 비밀키 없이 공개돼 있어도 안전하게: ① 1분 안에 다시 부르면 바로 끝 ② 같은 알림은 push_log 로 한 번만 보낸다
const INDEXES = [
  { sym: "^KS11", name: "코스피", chart: "KOSPI", mkt: "KR" },
  { sym: "^KQ11", name: "코스닥", chart: "KOSDAQ", mkt: "KR" },
  { sym: "^GSPC", name: "S&P500", chart: "S&P 500", mkt: "US" },
  { sym: "^IXIC", name: "나스닥", chart: "NASDAQ", mkt: "US" },
] as const;
const IDX_PCT = 2, WATCH_PCT = 5;
// 이미 보낸 알림인지 (기록은 남기지 않음) — 데이터를 다 모은 뒤 claim 으로 확정
async function alreadySent(key: string) { const { data } = await adminDb()!.from("push_log").select("key").eq("key", key).maybeSingle(); return !!data; }

type Q = { changePct: number; price: number };
const dayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const sign = (v: number) => (v >= 0 ? "+" : "-");
const fmt = (v: number, d = 2) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export async function GET(req: Request) {
  if (!pushReady()) return NextResponse.json({ skip: "not configured" });
  const last = Number((await getState("tick_at")) ?? 0);
  if (Date.now() - last < 60_000) return NextResponse.json({ skip: "too soon" });
  await setState("tick_at", String(Date.now()));

  const krOpen = clockOf(MARKETS.find(m => m.key === "KR")!).regular;
  const usOpen = clockOf(MARKETS.find(m => m.key === "US")!).regular;
  const log: string[] = [];

  // ── 1) 지수 ±2% 이상: 2%·3%·4%… 구간마다 한 번 ──
  const openIdx = INDEXES.filter(i => (i.mkt === "KR" ? krOpen : usOpen));
  if (openIdx.length) {
    const q = await yahooDaily(openIdx.map(i => i.sym));
    let subs: SubRow[] | null = null;
    for (const i of openIdx) {
      const d = q[i.sym];
      if (!d || Math.abs(d.changePct) < IDX_PCT) continue;
      const level = Math.floor(Math.abs(d.changePct));
      const day = dayIn(i.mkt === "KR" ? "Asia/Seoul" : "America/New_York");
      if (!(await claim(`idx:${i.sym}:${day}:${sign(d.changePct)}:${level}`))) continue;
      subs ??= await subsWhere("idx");
      const up = d.changePct >= 0;
      const n = await sendTo(subs, {
        title: `${up ? "📈" : "📉"} ${i.name} ${up ? "+" : ""}${d.changePct.toFixed(2)}% ${up ? "급등" : "급락"}`,
        body: `현재 ${fmt(d.price)} · 전일 대비 ${up ? "▲" : "▼"}${fmt(Math.abs(d.change))}`,
        url: `/?chart=${encodeURIComponent(i.chart)}`, tag: `idx-${i.sym}`,
      });
      log.push(`${i.name} ${d.changePct.toFixed(2)}% → ${n}`);
    }
  }

  // ── 2) 관심 종목 ±5% 이상: 회원별·종목별·방향별 하루 한 번 ──
  if (krOpen || usOpen) {
    const subs = (await subsWhere("watch")).filter(s => s.user_id);
    const users = Array.from(new Set(subs.map(s => s.user_id!)));
    if (users.length) {
      const { data: wl } = await adminDb()!.from("watchlist").select("user_id,code,name,market").in("user_id", users);
      const rows = (wl ?? []) as { user_id: string; code: string; name: string; market: string }[];
      const isUS = (r: { market: string }) => r.market === "US";
      const isKR = (r: { market: string }) => r.market !== "US" && !r.market.startsWith("ASIA");
      const kr = krOpen ? Array.from(new Set(rows.filter(isKR).map(r => r.code))) : [];
      const us = usOpen ? Array.from(new Set(rows.filter(isUS).map(r => r.code))) : [];
      const [krQ, usQ] = await Promise.all([
        kr.length ? naverRealtime(kr) : Promise.resolve({} as Record<string, Q>),
        us.length ? yahooDaily(us) : Promise.resolve({} as Record<string, Q>),
      ]);
      for (const r of rows) {
        const qv: Q | undefined = isUS(r) ? (usQ as Record<string, Q>)[r.code] : isKR(r) ? (krQ as Record<string, Q>)[r.code] : undefined;
        if (!qv || Math.abs(qv.changePct) < WATCH_PCT) continue;
        const day = dayIn(isUS(r) ? "America/New_York" : "Asia/Seoul");
        if (!(await claim(`w:${r.user_id}:${r.code}:${day}:${sign(qv.changePct)}`))) continue;
        const up = qv.changePct >= 0;
        const n = await sendTo(subs.filter(s => s.user_id === r.user_id), {
          title: `${up ? "🚀" : "⚠️"} ${r.name} ${up ? "+" : ""}${qv.changePct.toFixed(2)}% ${up ? "급등" : "급락"}`,
          body: `관심 종목 · 현재가 ${isUS(r) ? `$${fmt(qv.price)}` : `${Math.round(qv.price).toLocaleString("ko-KR")}원`}`,
          url: `/stock/${encodeURIComponent(r.code)}`, tag: `w-${r.code}`,
        });
        log.push(`${r.name} ${qv.changePct.toFixed(2)}% → ${n}`);
      }
    }
  }

  // ── 3) 장 마감 요약: 국내 15:35~17:30 · 미국 마감 직후(한국 아침) 하루 한 번 ──
  const origin = new URL(req.url).origin;
  const kst = new Date(Date.now() + 9 * 3600_000), kMin = kst.getUTCHours() * 60 + kst.getUTCMinutes(), kDay = kst.getUTCDay();
  const krYmd = dayIn("Asia/Seoul"), krHol = holidayOn("KR", krYmd);
  if (kDay >= 1 && kDay <= 5 && !(krHol && !krHol.early) && kMin >= 15 * 60 + 35 && kMin <= 17 * 60 + 30 && !(await alreadySent(`close:KR:${krYmd}`))) {
    const q = await yahooDaily(["^KS11", "^KQ11"]);
    const flow = await fetch(`${origin}/api/investor-flow?market=KOSPI`, { cache: "no-store", signal: AbortSignal.timeout(8000) })
      .then(r => r.json()).catch(() => null) as { flow?: { type: string; netBuy: number }[] } | null;
    const f = flow?.flow?.find(x => x.type === "foreign")?.netBuy, ins = flow?.flow?.find(x => x.type === "institution")?.netBuy;
    const eok = (v: number) => (Math.abs(v) >= 10000 ? `${v >= 0 ? "+" : "-"}${(Math.abs(v) / 10000).toFixed(1)}조` : `${v >= 0 ? "+" : ""}${Math.round(v).toLocaleString("ko-KR")}억`);
    const part = (sym: string, nm: string) => { const d = q[sym]; return d ? `${nm} ${fmt(d.price)} (${d.changePct >= 0 ? "+" : ""}${d.changePct.toFixed(2)}%)` : ""; };
    const body = [part("^KS11", "코스피"), part("^KQ11", "코스닥")].filter(Boolean).join(" · ") + (f != null ? `\n외국인 ${eok(f)}${ins != null ? ` · 기관 ${eok(ins)}` : ""} (코스피)` : "");
    if (q["^KS11"] && (await claim(`close:KR:${krYmd}`))) { const n = await sendTo(await subsWhere("close"), { title: "📊 오늘 국내 증시 마감", body, url: "/?m=kr", tag: "close-kr" }); log.push(`close KR → ${n}`); }
  }
  const etYmd = dayIn("America/New_York"), etDay = new Date(`${etYmd}T12:00:00Z`).getUTCDay(), usHol = holidayOn("US", etYmd);
  if (etDay >= 1 && etDay <= 5 && !(usHol && !usHol.early) && kMin >= 5 * 60 + 15 && kMin <= 8 * 60 + 30 && !usOpen && !(await alreadySent(`close:US:${etYmd}`))) {
    const q = await yahooDaily(["^GSPC", "^IXIC", "^DJI"]);
    const part = (sym: string, nm: string) => { const d = q[sym]; return d ? `${nm} ${d.changePct >= 0 ? "+" : ""}${d.changePct.toFixed(2)}%` : ""; };
    const body = [part("^GSPC", "S&P500"), part("^IXIC", "나스닥"), part("^DJI", "다우")].filter(Boolean).join(" · ");
    if (q["^GSPC"] && (await claim(`close:US:${etYmd}`))) { const n = await sendTo(await subsWhere("close"), { title: "🇺🇸 간밤 미국 증시 마감", body, url: "/?m=us", tag: "close-us" }); log.push(`close US → ${n}`); }
  }

  // ── 4) 블로그 새 글: 5분마다 확인(블로그 목록 캐시도 5분). 처음엔 기준만 저장하고 보내지 않는다 ──
  const blogAt = Number((await getState("blog_checked")) ?? 0);
  if (Date.now() - blogAt > 4 * 60_000) {
    await setState("blog_checked", String(Date.now()));
    try {
      const j = await (await fetch(`${new URL(req.url).origin}/api/blog-feed`, { cache: "no-store", signal: AbortSignal.timeout(8000) })).json() as { items?: { title: string; url: string }[] };
      const top = j.items?.[0];
      if (top?.url) {
        const prev = await getState("blog_last");
        if (prev !== top.url) {
          await setState("blog_last", top.url);
          if (prev && (await claim(`blog:${top.url}`))) {
            const n = await sendTo(await subsWhere("insight"), { title: "✍️ 알읽남 블로그 새 글", body: top.title.slice(0, 120), url: "/community", tag: "blog" });
            log.push(`blog → ${n}`);
          }
        }
      }
    } catch { /* 다음 번에 */ }
  }

  return NextResponse.json({ ok: true, krOpen, usOpen, sent: log });
}
