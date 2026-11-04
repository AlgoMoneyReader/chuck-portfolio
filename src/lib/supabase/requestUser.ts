import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

// API 라우트에서 요청한 사용자를 확인한다. 클라이언트가 Authorization: Bearer <access_token> 을 보낸다.
// 반환된 sb 는 그 사용자 권한(RLS)으로 동작한다.
export async function requestUser(req: Request): Promise<{ sb: SupabaseClient; user: User } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return null;
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return { sb, user: data.user };
}

export interface Quota { login: boolean; admin?: boolean; used?: number; limit?: number }
