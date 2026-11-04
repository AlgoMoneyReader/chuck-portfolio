import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

// 카카오 인가 코드 → 카카오 토큰(ID 토큰) → Supabase signInWithIdToken 으로 세션 쿠키 발급
export async function GET(request: Request) {
  const url = new URL(request.url);
  const store = cookies();
  const fail = (msg: string) => NextResponse.redirect(new URL(`/me?auth_error=${encodeURIComponent(msg)}`, url.origin));

  const code = url.searchParams.get("code");
  if (!code) return fail(url.searchParams.get("error_description") ?? "로그인이 취소되었습니다");
  if (!url.searchParams.get("state") || url.searchParams.get("state") !== store.get("kakao_state")?.value) return fail("로그인 요청이 만료되었습니다. 다시 시도해 주세요");
  const nonce = store.get("kakao_nonce")?.value;
  const next = store.get("kakao_next")?.value ?? "/me";

  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.KAKAO_REST_API_KEY ?? "",
      client_secret: process.env.KAKAO_CLIENT_SECRET ?? "",
      redirect_uri: `${url.origin}/auth/kakao/callback`,
      code,
    }),
    cache: "no-store",
  });
  const tok = await tokenRes.json().catch(() => ({}));
  if (!tok.id_token) return fail(`카카오 토큰 발급 실패: ${tok.error_description ?? tok.error ?? tokenRes.status} (OpenID Connect 활성화 확인)`);

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => list.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
  const { error } = await supabase.auth.signInWithIdToken({ provider: "kakao", token: tok.id_token, nonce });
  if (error) return fail(`Supabase 로그인 실패: ${error.message}`);

  const res = NextResponse.redirect(new URL(next, url.origin));
  for (const n of ["kakao_state", "kakao_nonce", "kakao_next"]) res.cookies.set(n, "", { path: "/auth/kakao", maxAge: 0 });
  return res;
}
