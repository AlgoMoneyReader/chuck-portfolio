import { NextResponse } from "next/server";
import { pushReady, sendTo, subsWhere } from "@/lib/push";
import { requestUser } from "@/lib/supabase/requestUser";

export const dynamic = "force-dynamic";

// 운영자가 릴스를 올리면 바로 '새 인사이트' 알림
export async function POST(req: Request) {
  const me = await requestUser(req);
  const { data: admin } = me ? await me.sb.rpc("is_admin") : { data: false };
  if (!me || admin !== true) return NextResponse.json({ error: "운영자만" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ ok: false, reason: "not configured" });
  const { caption } = await req.json().catch(() => ({})) as { caption?: string };
  const n = await sendTo(await subsWhere("insight"), {
    title: "🎬 알읽남 새 릴스", body: (caption?.trim() || "새 인사이트 영상이 올라왔어요").slice(0, 120), url: "/community", tag: "insight",
  });
  return NextResponse.json({ ok: true, sent: n });
}
