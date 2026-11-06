import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import path from "path";
import { yahooDaily } from "@/lib/yahooDaily";

// 카톡·인스타 DM·문자로 링크를 보낼 때 뜨는 미리보기 이미지 — 그날 주요 지수 시세가 들어간다
export const runtime = "nodejs";
export const revalidate = 600; // 10분마다 새로 (카카오는 자체 캐시가 있어 늦게 바뀔 수 있음)
export const alt = "알읽남 증시 레이더 — 오늘의 주요 지수";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const IDX = [
  { sym: "^KS11", name: "코스피" }, { sym: "^KQ11", name: "코스닥" },
  { sym: "^GSPC", name: "S&P500" }, { sym: "^IXIC", name: "나스닥" },
];

// 구글 폰트에서 쓰는 글자만 골라 TTF 로 받아온다 (한글 표시용)
async function font(weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(5000) })).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return r.ok ? await r.arrayBuffer() : null;
  } catch { return null; }
}

export default async function Image() {
  const q = await yahooDaily(IDX.map(i => i.sym)).catch(() => ({} as Awaited<ReturnType<typeof yahooDaily>>));
  const now = new Date(Date.now() + 9 * 3600_000);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const when = `${now.getUTCMonth() + 1}월 ${now.getUTCDate()}일 (${days[now.getUTCDay()]}) ${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} 기준`;
  const tiles = IDX.map(i => ({ ...i, d: q[i.sym] }));
  const title = "알읽남 증시 레이더", sub = "실시간 수급 · 시황 · 뉴스 · 경제 캘린더";
  const allText = title + sub + when + tiles.map(t => t.name).join("") + "▲▼+-.,%0123456789 alliknam.vercel.app";
  const [bold, regular] = await Promise.all([font(800, allText), font(500, allText)]);
  const fonts = [bold && { name: "KR", data: bold, weight: 800 as const }, regular && { name: "KR", data: regular, weight: 500 as const }].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 800 | 500 }[];
  let logo = "";
  try { logo = `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public/icons/icon-512.png"))).toString("base64")}`; } catch { /* 로고 없이 */ }

  const UP = "#22c55e", DOWN = "#ef4444";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(135deg, #04091A 0%, #0B1633 100%)", padding: "56px 64px", fontFamily: "KR", color: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {logo && <img src={logo} width={88} height={88} style={{ borderRadius: 22 }} alt="" />}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 54, fontWeight: 800, color: "#F5C542" }}>{title}</div>
            <div style={{ fontSize: 26, fontWeight: 500, color: "#94A3B8", marginTop: 4 }}>{sub}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 60 }}>
          {tiles.map(t => {
            const up = (t.d?.changePct ?? 0) >= 0, c = t.d ? (up ? UP : DOWN) : "#64748B";
            return (
              <div key={t.sym} style={{ flex: 1, display: "flex", flexDirection: "column", background: "rgba(255,255,255,0.05)", border: "2px solid rgba(255,255,255,0.10)", borderRadius: 24, padding: "26px 26px" }}>
                <div style={{ fontSize: 28, fontWeight: 500, color: "#CBD5E1" }}>{t.name}</div>
                <div style={{ fontSize: 38, fontWeight: 800, marginTop: 12 }}>{t.d ? t.d.price.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : "—"}</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: c, marginTop: 6 }}>{t.d ? `${up ? "▲" : "▼"} ${up ? "+" : ""}${t.d.changePct.toFixed(2)}%` : ""}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto", fontSize: 26, fontWeight: 500, color: "#94A3B8" }}>
          <div style={{ display: "flex" }}>{when}</div>
          <div style={{ display: "flex", color: "#38BDF8" }}>alliknam.vercel.app</div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
