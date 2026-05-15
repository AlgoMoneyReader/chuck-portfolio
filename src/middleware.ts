import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "admin_session";

// 인증이 필요한 경로 목록
const PROTECTED = ["/admin", "/portfolio"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PROTECTED.some(p => pathname.startsWith(p))) {
    const token = request.cookies.get(SESSION_COOKIE);

    // 쿠키 없으면 로그인 페이지로
    if (!token?.value) {
      const loginUrl = new URL("/admin-login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // 토큰 유효성 체크
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
  matcher: ["/admin/:path*", "/portfolio/:path*", "/portfolio"],
};
