import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// 카카오 로그인 시작. 닉네임만 요청(openid profile_nickname) — 이메일·프로필 사진은 받지 않는다.
// nonce 원문은 쿠키에, 카카오에는 SHA-256 값을 보낸다(Supabase 가 원문을 해시해 ID 토큰의 nonce 와 비교)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = process.env.KAKAO_REST_API_KEY;
  if (!clientId) return NextResponse.redirect(new URL("/me?auth_error=KAKAO_REST_API_KEY 미설정", url.origin));

  const next = url.searchParams.get("next") ?? "/me";
  const state = randomBytes(16).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  const authorize = new URL("https://kauth.kakao.com/oauth/authorize");
  authorize.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${url.origin}/auth/kakao/callback`,
    response_type: "code",
    scope: "openid profile_nickname",
    state,
    nonce: createHash("sha256").update(nonce).digest("hex"),
  }).toString();

  const res = NextResponse.redirect(authorize);
  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/auth/kakao", maxAge: 600 };
  res.cookies.set("kakao_state", state, opts);
  res.cookies.set("kakao_nonce", nonce, opts);
  res.cookies.set("kakao_next", next.startsWith("/") && !next.startsWith("//") ? next : "/me", opts);
  return res;
}
