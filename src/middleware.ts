import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "admin_session";

export function middleware(request: NextRequest) {
  // /admin 경로만 보호
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const token = request.cookies.get(SESSION_COOKIE);

    // 쿠키 없으면 로그인 페이지로
    if (!token?.value) {
      const loginUrl = new URL("/admin-login", request.url);
      loginUrl.searchParams.set("from", request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }

    // 토큰 최소 유효성 체크 (base64 디코드 가능한지)
    try {
      const decoded = Buffer.from(token.value, "base64").toString("utf-8");
      if (!decoded.startsWith("chuck-admin:")) {
        throw new Error("invalid token");
      }
    } catch {
      const loginUrl = new URL("/admin-login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
