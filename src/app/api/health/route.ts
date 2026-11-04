import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKisToken } from "@/lib/fetchKisMaster";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";
export const maxDuration = 60;

// 설정 점검용. 키 값은 절대 내보내지 않고 있음/없음과 연결 결과만 보여준다
const ENV = ["KAKAO_REST_API_KEY", "KAKAO_CLIENT_SECRET", "KIS_APP_KEY", "KIS_APP_SECRET", "DART_API_KEY", "GEMINI_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const TABLES = ["profiles", "posts", "comments", "post_likes", "watchlist"];

async function check(fn: () => Promise<string>): Promise<string> {
  try { return await fn(); } catch (e) { return `실패: ${String(e).slice(0, 120)}`; }
}

export async function GET() {
  const env = Object.fromEntries(ENV.map(k => [k, process.env[k] ? "있음" : "없음"]));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const [kis, dart, gemini, tables, providers, dartCorpCode, naverNotice, region] = await Promise.all([
    check(async () => { await getKisToken(); return "정상"; }),
    check(async () => {
      const key = process.env.DART_API_KEY;
      if (!key) return "키 없음";
      const d = await (await fetch(`https://opendart.fss.or.kr/api/list.json?crtfc_key=${key}&page_count=1`, { cache: "no-store" })).json();
      return d.status === "000" || d.status === "013" ? "정상" : `DART ${d.status} ${d.message ?? ""}`;
    }),
    check(async () => {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return "키 없음";
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash?key=${key}`, { cache: "no-store" });
      return r.ok ? "정상" : `HTTP ${r.status}`;
    }),
    check(async () => {
      if (!url || !anon) return "Supabase 환경변수 없음";
      const sb = createClient(url, anon);
      const out: string[] = [];
      for (const t of TABLES) {
        const { error } = await sb.from(t).select("*", { count: "exact", head: true });
        out.push(`${t}: ${error ? `없음/오류 (${error.message.slice(0, 60)})` : "정상"}`);
      }
      return out.join(" · ");
    }),
    check(async () => {
      if (!url || !anon) return "Supabase 환경변수 없음";
      const s = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon }, cache: "no-store" })).json();
      const ext = s.external ?? {};
      return `kakao: ${ext.kakao ? "켜짐" : "꺼짐"}`;
    }),
    // 공시·분기 실적에 필요한 DART 고유번호 파일(corpCode.xml) 다운로드를 시간·크기까지 잰다
    check(async () => {
      const key = process.env.DART_API_KEY;
      if (!key) return "키 없음";
      const t0 = Date.now();
      const res = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${key}`, { cache: "no-store", signal: AbortSignal.timeout(55000) });
      const buf = await res.arrayBuffer();
      const head = new TextDecoder().decode(buf.slice(0, 2));
      return `HTTP ${res.status} · ${Math.round(buf.byteLength / 1024)}KB · ${((Date.now() - t0) / 1000).toFixed(1)}초 · ${head === "PK" ? "zip 정상" : `zip 아님: ${new TextDecoder().decode(buf.slice(0, 120))}`}`;
    }),
    // 네이버: 간단한 UA / 실제 브라우저 헤더 / 모바일 API 를 나눠 어디서 막히는지 본다
    check(async () => {
      const BROWSER = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        Referer: "https://finance.naver.com/",
      };
      const t = async (url: string, headers: Record<string, string>) => {
        try { return (await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(8000) })).status; } catch (e) { return String(e).slice(0, 30); }
      };
      const [simple, browser, research, mobile] = await Promise.all([
        t("https://finance.naver.com/item/news_notice.naver?code=005930&page=1", { "User-Agent": "Mozilla/5.0" }),
        t("https://finance.naver.com/item/news_notice.naver?code=005930&page=1", BROWSER),
        t("https://finance.naver.com/research/company_list.naver?searchType=itemCode&itemCode=005930", BROWSER),
        t("https://m.stock.naver.com/api/stocks/marketValue/KOSPI?page=1&pageSize=5", { "User-Agent": "Mozilla/5.0", Referer: "https://m.stock.naver.com/" }),
      ]);
      return `공시(기본UA) ${simple} · 공시(브라우저헤더) ${browser} · 리서치 ${research} · 모바일API ${mobile}`;
    }),
    check(async () => `${process.env.VERCEL_REGION ?? "알 수 없음"}`),
  ]);

  return NextResponse.json({ env, kis, dart, gemini, supabaseTables: tables, loginProviders: providers, dartCorpCode, naverNotice, serverRegion: region }, { headers: { "Cache-Control": "no-store" } });
}
