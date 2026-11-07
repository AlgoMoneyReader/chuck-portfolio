import { NextResponse } from "next/server";
import { renderStockCard } from "@/lib/shareCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

// 종목 공유 이미지: /api/share-card?code=005930  ·  /api/share-card?code=AAPL&name=애플
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const code = (sp.get("code") ?? "").trim();
  if (!/^[0-9A-Za-z.\-]{1,12}$/.test(code)) return NextResponse.json({ error: "code" }, { status: 400 });
  return renderStockCard(code, (sp.get("name") ?? "").slice(0, 30) || undefined);
}
