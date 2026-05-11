import { NextResponse } from "next/server";
import { STOCK_MASTER_FILTERED } from "@/lib/stockMaster";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(STOCK_MASTER_FILTERED, {
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
