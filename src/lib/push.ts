// 서버 전용: 푸시 발송 · 구독 관리 · 중복 방지
import webpush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { VAPID_PUBLIC_KEY } from "./pushConfig";

export interface PushPayload { title: string; body: string; url?: string; tag?: string }
export interface SubRow { endpoint: string; p256dh: string; auth: string; user_id: string | null; insight: boolean; idx: boolean; watch: boolean; close?: boolean }

let admin: SupabaseClient | null = null;
/** service_role 키로 RLS 를 건너뛰는 서버 전용 클라이언트. 키가 없으면 null (알림 기능 꺼짐) */
export function adminDb(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  admin ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

let vapidReady = false;
export function pushReady(): boolean {
  if (vapidReady) return true;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv || !adminDb()) return false;
  webpush.setVapidDetails("https://alliknam.vercel.app", VAPID_PUBLIC_KEY, priv);
  vapidReady = true;
  return true;
}

/** 이 키로 처음 보내는 알림이면 true (기록을 남김). 이미 보냈으면 false */
export async function claim(key: string): Promise<boolean> {
  const db = adminDb();
  if (!db) return false;
  const { data, error } = await db.from("push_log").upsert({ key }, { onConflict: "key", ignoreDuplicates: true }).select("key");
  return !error && !!data?.length;
}

export async function getState(key: string): Promise<string | null> {
  const { data } = await adminDb()!.from("push_state").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | undefined) ?? null;
}
export async function setState(key: string, value: string) {
  await adminDb()!.from("push_state").upsert({ key, value, updated_at: new Date().toISOString() });
}

/** 여러 구독에 보내기. 만료된 구독(404·410)은 지운다. 보낸 수를 돌려준다 */
export async function sendTo(subs: SubRow[], payload: PushPayload): Promise<number> {
  if (!subs.length || !pushReady()) return 0;
  const body = JSON.stringify(payload);
  const dead: string[] = [];
  let ok = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: "high" });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.endpoint);
    }
  }));
  if (dead.length) await adminDb()!.from("push_subs").delete().in("endpoint", dead);
  return ok;
}

export async function subsWhere(col: "insight" | "idx" | "watch" | "close"): Promise<SubRow[]> {
  const { data } = await adminDb()!.from("push_subs").select("endpoint,p256dh,auth,user_id,insight,idx,watch").eq(col, true);
  return (data ?? []) as SubRow[];
}
