import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import path from "path";
import { krFonts } from "./ogFont";
import { yahooDaily } from "./yahooDaily";
import { getLiveFlow } from "./liveFlow";
import { STOCK_MASTER } from "./stockMaster";

// 종목 공유 카드 (1200×630) — 카톡·인스타로 보낼 이미지이자 /stock/[code] 링크 미리보기
export const CARD_SIZE = { width: 1200, height: 630 };

interface Quote { name: string; price: number; change: number; pct: number; us: boolean; flow?: { foreign?: number | null; inst?: number | null; label: string } }

const isKr = (code: string) => /^[0-9][0-9A-Z]{5}$/.test(code);
const n = (v: unknown) => { const x = parseFloat(String(v ?? "").replace(/,/g, "")); return isNaN(x) ? 0 : x; };
const race = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]);

async function krQuote(code: string): Promise<Quote | null> {
  try {
    const r = await fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://m.stock.naver.com/" }, signal: AbortSignal.timeout(4000), cache: "no-store",
    });
    const d = ((await r.json()) as { datas?: Record<string, unknown>[] }).datas?.[0];
    if (!d) return null;
    const pct = n(d.fluctuationsRatioRaw ?? d.fluctuationsRatio), ch = Math.abs(n(d.compareToPreviousClosePriceRaw ?? d.compareToPreviousClosePrice));
    const q: Quote = { name: String(d.stockName ?? code), price: n(d.closePriceRaw ?? d.closePrice), change: pct < 0 ? -ch : ch, pct, us: false };
    // 오늘 외국인·기관 (장중 가집계 또는 마감 확정치). 늦으면 빼고 그린다
    const f = await race(getLiveFlow(code).catch(() => null), 3500);
    if (f && (f.foreignEok != null || f.globalEok != null)) {
      q.flow = { foreign: f.foreignEok ?? f.globalEok ?? null, inst: f.institutionEok ?? null, label: f.final ? "오늘 확정" : f.asOf ? `${f.asOf} 집계` : "장중 추정" };
    }
    return q;
  } catch { return null; }
}

async function usQuote(code: string, name?: string): Promise<Quote | null> {
  const d = (await yahooDaily([code]).catch(() => ({} as Awaited<ReturnType<typeof yahooDaily>>)))[code];
  return d ? { name: name || code, price: d.price, change: d.change, pct: d.changePct, us: true } : null;
}

const eok = (v: number) => { const a = Math.abs(v); const s = v >= 0 ? "+" : "-"; return a >= 10000 ? `${s}${(a / 10000).toFixed(1)}조` : `${s}${Math.round(a).toLocaleString("ko-KR")}억`; };

export async function renderStockCard(rawCode: string, name?: string): Promise<ImageResponse> {
  const code = rawCode.toUpperCase();
  const q = isKr(code) ? await krQuote(code) : await usQuote(code, name);
  const now = new Date(Date.now() + 9 * 3600_000);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const when = `${now.getUTCMonth() + 1}월 ${now.getUTCDate()}일 (${days[now.getUTCDay()]}) ${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} 기준`;
  const up = (q?.pct ?? 0) >= 0, color = !q ? "#94A3B8" : q.pct > 0 ? "#22c55e" : q.pct < 0 ? "#ef4444" : "#CBD5E1";
  const price = !q ? "—" : q.us ? `$${q.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${Math.round(q.price).toLocaleString("ko-KR")}원`;
  const chg = !q ? "" : `${up ? "▲" : "▼"} ${q.us ? `$${Math.abs(q.change).toFixed(2)}` : `${Math.round(Math.abs(q.change)).toLocaleString("ko-KR")}원`} (${up ? "+" : ""}${q.pct.toFixed(2)}%)`;
  const title = q?.name ?? name ?? STOCK_MASTER.find(s => s.code === code)?.name ?? code;
  const flowText = q?.flow ? [q.flow.foreign != null ? `외국인 ${eok(q.flow.foreign)}` : "", q.flow.inst != null ? `기관 ${eok(q.flow.inst)}` : ""].filter(Boolean).join("   ") : "";
  const brand = "알읽남 증시 레이더", site = "alliknam.vercel.app";
  const fonts = await krFonts(title + price + chg + flowText + (q?.flow?.label ?? "") + when + brand + site + code + "국내미국종목");
  let logo = "";
  try { logo = `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public/icons/icon-192.png"))).toString("base64")}`; } catch { /* 로고 없이 */ }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(135deg, #04091A 0%, #0B1633 100%)", padding: "52px 64px", fontFamily: "KR", color: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {logo && <img src={logo} width={56} height={56} style={{ borderRadius: 14 }} alt="" />}
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#F5C542" }}>{brand}</div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 44 }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800 }}>{title.length > 14 ? title.slice(0, 14) + "…" : title}</div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: "#94A3B8" }}>{code} · {q?.us ? "미국" : "국내"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 26, marginTop: 18 }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 800 }}>{price}</div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color }}>{chg}</div>
        </div>
        {flowText && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 26, fontSize: 32, fontWeight: 800 }}>
            <div style={{ display: "flex", gap: 28, padding: "8px 18px", borderRadius: 14, background: "rgba(255,255,255,0.07)", color: "#E2E8F0" }}>
              {flowText.split("   ").map(t => <div key={t} style={{ display: "flex" }}>{t}</div>)}
            </div>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: "#64748B" }}>{q!.flow!.label}</div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto", fontSize: 26, fontWeight: 500, color: "#94A3B8" }}>
          <div style={{ display: "flex" }}>{when}</div>
          <div style={{ display: "flex", color: "#38BDF8" }}>{site}</div>
        </div>
      </div>
    ),
    { ...CARD_SIZE, fonts: fonts.length ? fonts : undefined, headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
  );
}
