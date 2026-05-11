import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const SESSION_COOKIE = "admin_session";
const MAX_AGE = 60 * 60 * 8; // 8시간

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
    }

    if (password !== adminPassword) {
      return NextResponse.json({ error: "비밀번호가 틀렸습니다" }, { status: 401 });
    }

    // 간단한 세션 토큰 (실제 서비스라면 JWT 사용 권장)
    const token = Buffer.from(`chuck-admin:${Date.now()}`).toString("base64");

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: MAX_AGE,
      path: "/",
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "요청 처리 오류" }, { status: 400 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
