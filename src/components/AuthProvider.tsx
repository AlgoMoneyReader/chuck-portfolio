"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";

export interface Profile { id: string; nickname: string; created_at: string }

interface AuthState {
  configured: boolean;
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  signIn: (provider: "kakao", next?: string) => Promise<void>;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getBrowserSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (u: User | null) => {
    if (!supabase || !u) { setProfile(null); setIsAdmin(false); return; }
    const [{ data }, adm] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", u.id).maybeSingle(),
      supabase.from("admins").select("user_id").eq("user_id", u.id).maybeSingle(),
    ]);
    setProfile((data as Profile) ?? null);
    setIsAdmin(!!adm.data);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      await loadProfile(data.user);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      loadProfile(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase, loadProfile]);

  // 카카오 로그인은 서버 라우트가 직접 처리(닉네임만 요청) → Supabase 세션 쿠키 발급
  const signIn = useCallback(async (_provider: "kakao", next = "/me") => {
    window.location.href = `/auth/kakao?next=${encodeURIComponent(next)}`;
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
  }, [supabase]);

  const reloadProfile = useCallback(() => loadProfile(user), [loadProfile, user]);

  return (
    <Ctx.Provider value={{ configured: !!supabase, loading, user, profile, isAdmin, signIn, signOut, reloadProfile }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
