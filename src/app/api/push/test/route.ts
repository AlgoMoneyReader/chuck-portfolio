import { NextResponse } from "next/server";
import { adminDb, claim, sendTo, type SubRow } from "@/lib/push";

export const dynamic = "force-dynamic";

// 알림 설정 화면의 '테스트 알림' — 이 기기 구독에만, 1분에 한 번
export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "알림 기능이 아직 설정되지 않았습니다" }, { status: 503 });
  const { endpoint } = await req.json().catch(() => ({})) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: "endpoint" }, { status: 400 });
  const { data } = await db.from("push_subs").select("endpoint,p256dh,auth,user_id,insight,idx,watch").eq("endpoint", endpoint).maybeSingle();
  if (!data) return NextResponse.json({ error: "구독을 찾을 수 없습니다" }, { status: 404 });
  if (!(await claim(`test:${endpoint.slice(-40)}:${Math.floor(Date.now() / 60_000)}`))) return NextResponse.json({ error: "잠시 후 다시 시도해 주세요" }, { status: 429 });
  const n = await sendTo([data as SubRow], { title: "알읽남 알림 테스트", body: "알림이 잘 도착했어요! 지수·관심 종목 급등락과 새 인사이트를 알려드릴게요.", url: "/", tag: "test" });
  return NextResponse.json({ ok: n > 0 });
}
