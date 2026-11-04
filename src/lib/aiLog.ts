import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AiUsage } from "./claude";

export interface AiLogCtx { feature: string; userId?: string | null; detail?: string; sb?: SupabaseClient }

// AI 호출 1건을 ai_logs 에 남긴다. 로그인 사용자는 그 사용자 권한(sb)으로, 시스템 작업은 익명 키로.
// 실패해도 본 기능에는 영향 없음.
export async function logAI(ctx: AiLogCtx | undefined, model: string, u: AiUsage) {
  if (!ctx) return;
  try {
    const sb = ctx.sb ?? (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
      : null);
    if (!sb) return;
    await sb.from("ai_logs").insert({
      user_id: ctx.sb ? ctx.userId ?? null : null, feature: ctx.feature, model,
      input_tokens: u.input, output_tokens: u.output, searches: u.searches,
      cost_usd: Number(u.costUsd.toFixed(5)), detail: ctx.detail?.slice(0, 200) ?? null,
    });
  } catch { /* 기록 실패 무시 */ }
}
