"use client";

import { getBrowserSupabase } from "./client";

// 로그인 토큰을 붙여 API 호출
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const sb = getBrowserSupabase();
  const token = sb ? (await sb.auth.getSession()).data.session?.access_token : undefined;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
