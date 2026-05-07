import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET /api/portfolio?user_id=xxx
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase 미설정 — .env.local에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 추가하세요" }, { status: 503 });
  }

  const userId = req.nextUrl.searchParams.get("user_id") ?? "default";
  const { data, error } = await supabase
    .from("holdings")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ holdings: data });
}

// POST /api/portfolio — add holding
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase 미설정" }, { status: 503 });
  }

  const body = await req.json();
  const { user_id = "default", ticker, name, qty, avg_price, currency = "KRW", sector = "" } = body;

  if (!ticker || !qty || !avg_price) {
    return NextResponse.json({ error: "ticker, qty, avg_price는 필수입니다" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("holdings")
    .upsert({ user_id, ticker: ticker.toUpperCase(), name, qty: Number(qty), avg_price: Number(avg_price), currency, sector }, { onConflict: "user_id,ticker" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ holding: data });
}

// DELETE /api/portfolio?user_id=xxx&ticker=AAPL
export async function DELETE(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase 미설정" }, { status: 503 });
  }

  const userId = req.nextUrl.searchParams.get("user_id") ?? "default";
  const ticker = req.nextUrl.searchParams.get("ticker");

  if (!ticker) return NextResponse.json({ error: "ticker가 필요합니다" }, { status: 400 });

  const { error } = await supabase
    .from("holdings")
    .delete()
    .eq("user_id", userId)
    .eq("ticker", ticker.toUpperCase());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
