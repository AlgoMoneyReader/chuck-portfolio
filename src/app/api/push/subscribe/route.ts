import { NextResponse } from "next/server";
import { adminDb } from "@/lib/push";
import { requestUser } from "@/lib/supabase/requestUser";

export const dynamic = "force-dynamic";

// 알림 구독 저장·설정 변경 (로그인했으면 회원과 연결 → 관심 종목 알림 가능)
export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "알림 기능이 아직 설정되지 않았습니다" }, { status: 503 });
  const body = await req.json().catch(() => null) as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; prefs?: { insight?: boolean; idx?: boolean; watch?: boolean; close?: boolean; dart?: boolean } } | null;
  const s = body?.subscription;
  const endpoint = s?.endpoint ?? "", p256dh = s?.keys?.p256dh ?? "", auth = s?.keys?.auth ?? "";
  // 브라우저 푸시 서버 주소만 받는다
  if (!/^https:\/\/[a-z0-9.-]+\//i.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ error: "잘못된 구독 정보" }, { status: 400 });
  }
  const me = await requestUser(req);
  const p = body?.prefs ?? {};
  const row = {
    endpoint, p256dh, auth, user_id: me?.user.id ?? null,
    insight: p.insight !== false, idx: p.idx !== false, watch: !!me && p.watch !== false, close: p.close !== false, dart: !!me && p.dart !== false,
    ua: (req.headers.get("user-agent") ?? "").slice(0, 200), updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("push_subs").upsert(row, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, watch: row.watch });
}

// 알림 끄기
export async function DELETE(req: Request) {
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: true });
  const { endpoint } = await req.json().catch(() => ({})) as { endpoint?: string };
  if (endpoint) await db.from("push_subs").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
