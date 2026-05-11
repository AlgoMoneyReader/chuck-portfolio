import { NextResponse } from "next/server";

// KRX 투자자별 매매동향 API
const KRX_URL = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";

interface FlowItem {
  type: "foreign" | "institution" | "individual";
  label: string;
  netBuy: number;   // 억원, 양수=순매수 음수=순매도
  buy: number;
  sell: number;
}

function getTodayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split("T")[0].replace(/-/g, "");
}

function parseAmount(val: unknown): number {
  if (!val) return 0;
  const n = parseInt(String(val).replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

async function fetchKRXFlow(market: string): Promise<FlowItem[]> {
  const today = getTodayKST();
  const mktId = market === "KOSDAQ" ? "KSQ" : "STK";

  const params = new URLSearchParams({
    bld: "dbms/MDC/STAT/standard/MDCSTAT02023",
    mktId,
    strtDd: today,
    endDd: today,
    share: "1",
    money: "1",
    csvxls_isNo: "false",
  });

  const res = await fetch(KRX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020203",
      "User-Agent": "Mozilla/5.0",
    },
    body: params.toString(),
    next: { revalidate: 300 },
  });

  if (!res.ok) throw new Error(`KRX HTTP ${res.status}`);
  const json = await res.json();

  // KRX 응답: OutBlock_1 배열, 마지막 항목이 당일 합산
  const rows: Record<string, string>[] = json?.OutBlock_1 ?? json?.output ?? [];
  if (!rows.length) throw new Error("KRX empty response");

  const d = rows[rows.length - 1];

  return [
    {
      type: "foreign",
      label: "외국인",
      netBuy: parseAmount(d.FRGNR_NETBUY_TRDVOL ?? d.FRGNR_NET ?? d["외국인_순매수"]),
      buy: parseAmount(d.FRGNR_BUY_TRDVOL ?? d["외국인_매수"]),
      sell: parseAmount(d.FRGNR_SELL_TRDVOL ?? d["외국인_매도"]),
    },
    {
      type: "institution",
      label: "기관",
      netBuy: parseAmount(d.ORGN_NETBUY_TRDVOL ?? d.ORGN_NET ?? d["기관_순매수"]),
      buy: parseAmount(d.ORGN_BUY_TRDVOL ?? d["기관_매수"]),
      sell: parseAmount(d.ORGN_SELL_TRDVOL ?? d["기관_매도"]),
    },
    {
      type: "individual",
      label: "개인",
      netBuy: parseAmount(d.INDV_NETBUY_TRDVOL ?? d.INDV_NET ?? d["개인_순매수"]),
      buy: parseAmount(d.INDV_BUY_TRDVOL ?? d["개인_매수"]),
      sell: parseAmount(d.INDV_SELL_TRDVOL ?? d["개인_매도"]),
    },
  ];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "KOSPI";

  try {
    const flow = await fetchKRXFlow(market);
    return NextResponse.json({ market, flow, timestamp: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: "투자자 동향 데이터를 불러올 수 없습니다", detail: String(err) },
      { status: 500 }
    );
  }
}
