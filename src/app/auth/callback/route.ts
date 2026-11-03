import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

// 카카오·구글 로그인 후 Supabase가 ?code= 를 붙여 이곳으로 돌려보낸다 → 세션 쿠키로 교환
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/me";

  if (!code) {
    const err = url.searchParams.get("error_description") ?? "로그인이 취소되었습니다";
    return NextResponse.redirect(new URL(`/me?auth_error=${encodeURIComponent(err)}`, url.origin));
  }

  const store = cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => list.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/me?auth_error=${encodeURIComponent(error.message)}`, url.origin));
  }
  return NextResponse.redirect(new URL(dest, url.origin));
}
