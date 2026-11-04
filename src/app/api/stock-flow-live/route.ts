import { NextResponse } from "next/server";
import { getLiveFlow } from "@/lib/liveFlow";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "code" }, { status: 400 });
  try {
    return NextResponse.json(await getLiveFlow(code));
  } catch (e) {
    return NextResponse.json({ available: false, error: String(e).slice(0, 160) });
  }
}
