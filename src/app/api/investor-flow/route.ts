import { NextResponse } from "next/server";
import { getKisToken as getKISToken } from "@/lib/fetchKisMaster";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

interface FlowItem {
  type: "foreign" | "institution" | "individual";
  label: string;
  netBuy: number;
  buy: number;
  sell: number;
}

interface RankItem { netBuyAmount: number; }
interface Flow3 { individual: number; foreign: number; institution: number; }

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function parseNum(s: string): number {
  const n = parseInt(s.replace(/[,\s+]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

function kstDate(): string {
  const k = new Date(Date.now() + 9 * 3_600_000);
  return k.toISOString().slice(0, 10).replace(/-/g, "");
}

// 네이버 투자자별 매매동향(일별) — 시장 전체, 단위 억원
async function fromNaverDaily(market: string): Promise<Flow3> {
  const sosok = market === "KOSDAQ" ? "02" : "01";
  const url = `https://finance.naver.com/sise/investorDealTrendDay.naver?bizdate=${kstDate()}&sosok=${sosok}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://finance.naver.com/sise/", "Accept-Language": "ko-KR,ko;q=0.9" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`naver HTTP ${res.status}`);
  const html = new TextDecoder("euc-kr").decode(await res.arrayBuffer());

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const tds = Array.from(m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(t =>
      t[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").trim()
    );
    if (tds.length < 4 || !/^\d{2,4}\.\d{2}\.\d{2}$/.test(tds[0])) continue;
    const f: Flow3 = { individual: parseNum(tds[1]), foreign: parseNum(tds[2]), institution: parseNum(tds[3]) };
    if (Math.abs(f.individual) + Math.abs(f.foreign) + Math.abs(f.institution) === 0) continue;
    return f;
  }
  throw new Error("naver: no data row");
}

// KIS 시장별 투자자매매동향(일별) — alliknam collect/kis.py market_investor 와 동일 호출. 백만원 → 억원
async function fromKIS(market: string): Promise<Flow3> {
  const key = process.env.KIS_APP_KEY, secret = process.env.KIS_APP_SECRET;
  if (!key || !secret) throw new Error("KIS env missing");
  const token = await getKISToken();
  const kosdaq = market === "KOSDAQ";
  const code = kosdaq ? "1001" : "0001";
  const isc = kosdaq ? "KSQ" : "KSP";
  const toUk = (s: string) => Math.round(parseNum(s ?? "0") / 100);

  // 당일 값이 비어 있으면(장중/휴장) 최대 7일 전까지 거슬러 올라간다
  for (let back = 0; back < 7; back++) {
    const d = new Date(Date.now() + 9 * 3_600_000 - back * 86_400_000);
    if ([0, 6].includes(d.getUTCDay())) continue;
    const d8 = d.toISOString().slice(0, 10).replace(/-/g, "");
    const qs = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "U", FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: d8, FID_INPUT_ISCD_1: isc,
      FID_INPUT_DATE_2: d8, FID_INPUT_ISCD_2: code,
    });
    const res = await fetch(
      `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor-daily-by-market?${qs}`,
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          authorization: `Bearer ${token}`,
          appkey: key, appsecret: secret,
          tr_id: "FHPTJ04040000", custtype: "P", tr_cont: "",
        },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      }
    );
    const j = await res.json().catch(() => null);
    if (!j || j.rt_cd !== "0") throw new Error(`KIS ${j?.msg_cd ?? res.status} ${(j?.msg1 ?? "").trim()}`);
    let rows = j.output ?? j.output1 ?? [];
    if (!Array.isArray(rows)) rows = [rows];
    const r = rows.find((x: Record<string, string>) => x.stck_bsop_date === d8) ?? rows[0];
    if (!r) continue;
    const f: Flow3 = {
      individual: toUk(r.prsn_ntby_tr_pbmn),
      foreign: toUk(r.frgn_ntby_tr_pbmn),
      institution: toUk(r.orgn_ntby_tr_pbmn),
    };
    if (Math.abs(f.individual) + Math.abs(f.foreign) + Math.abs(f.institution) > 0) return f;
  }
  throw new Error("KIS: no data");
}

// 3순위: 순매수 상위 종목 합산 (근사치) — 요청 origin으로 호출해 배포 보호 우회
async function fromRanking(origin: string): Promise<Flow3> {
  const res = await fetch(`${origin}/api/investor-ranking`, { signal: AbortSignal.timeout(10000), cache: "no-store" });
  if (!res.ok) throw new Error(`ranking HTTP ${res.status}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error);
  const sum = (a: RankItem[]) => a.reduce((s, r) => s + (r.netBuyAmount ?? 0), 0);
  return {
    foreign: sum(d.buy.foreign) + sum(d.sell.foreign),
    institution: sum(d.buy.institution) + sum(d.sell.institution),
    individual: sum(d.buy.individual) + sum(d.sell.individual),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const market = url.searchParams.get("market") ?? "KOSPI";
  const errors: string[] = [];

  const sources: [string, () => Promise<Flow3>][] = [
    ["kis", () => fromKIS(market)],
    ["naver", () => fromNaverDaily(market)],
    ["ranking", () => fromRanking(url.origin)],
  ];

  for (const [name, fn] of sources) {
    try {
      const f = await fn();
      const flow: FlowItem[] = [
        { type: "foreign", label: "외국인", netBuy: f.foreign, buy: 0, sell: 0 },
        { type: "institution", label: "기관", netBuy: f.institution, buy: 0, sell: 0 },
        { type: "individual", label: "개인", netBuy: f.individual, buy: 0, sell: 0 },
      ];
      return NextResponse.json({ market, flow, source: name, timestamp: new Date().toISOString() });
    } catch (e) {
      errors.push(`${name}: ${String(e)}`);
    }
  }
  return NextResponse.json({ error: "투자자 동향 데이터를 불러올 수 없습니다", debug: errors }, { status: 500 });
}
