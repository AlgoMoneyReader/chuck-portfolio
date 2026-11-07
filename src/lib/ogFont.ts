// 공유 이미지(ImageResponse)용 한글 글꼴 — 구글 폰트에서 쓰는 글자만 골라 TTF 로 받는다 (10분 메모리 보관)
const cache = new Map<string, { at: number; data: ArrayBuffer }>();

async function one(weight: number, text: string): Promise<ArrayBuffer | null> {
  const key = `${weight}:${text}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 600_000) return hit.data;
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(5000) })).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const data = await r.arrayBuffer();
    if (cache.size > 50) cache.clear();
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch { return null; }
}

/** 화면에 쓰는 글자를 모두 넘기면 굵게(800)·보통(500) 두 벌을 돌려준다. 실패하면 빈 배열(기본 글꼴) */
export async function krFonts(text: string) {
  const uniq = Array.from(new Set(Array.from(text + "0123456789+-.,%▲▼·:() "))).join("");
  const [bold, regular] = await Promise.all([one(800, uniq), one(500, uniq)]);
  return [
    bold && { name: "KR", data: bold, weight: 800 as const, style: "normal" as const },
    regular && { name: "KR", data: regular, weight: 500 as const, style: "normal" as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 800 | 500; style: "normal" }[];
}
