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

// AI 한도: 생성 '전에' 1회 차감(원자적, count < 5 일 때만) → 동시에 여러 번 보내 한도를 넘기는 것 방지.
// 생성에 실패하면 refundQuota 로 돌려준다. 함수가 아직 없으면(SQL 미실행) 예전처럼 막지 않는다.
export async function reserveQuota(sb: SupabaseClient): Promise<{ ok: boolean; quota: Quota }> {
  const { data, error } = await sb.rpc("use_ai_quota");
  if (error || !data) return { ok: true, quota: { login: true } };
  const d = data as { ok?: boolean; admin?: boolean; used?: number; limit?: number };
  return { ok: d.ok !== false, quota: { login: true, admin: d.admin, used: d.used, limit: d.limit } };
}
export async function refundQuota(sb: SupabaseClient) {
  try { await sb.rpc("refund_ai_quota"); } catch { /* 함수가 없으면 무시 */ }
}
