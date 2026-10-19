import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface FlowItem {
  type: "foreign" | "institution" | "individual";
  label: string;
  netBuy: number;
  buy: number;
  sell: number;
}

// investor-ranking API에서 반환하는 RankItem 타입 (일부만 사용)
interface RankItem {
  netBuyAmount: number; // 억원 (양수=순매수, 음수=순매도)
}

function sumAmounts(items: RankItem[]): number {
  return items.reduce((s, r) => s + (r.netBuyAmount ?? 0), 0);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "KOSPI";

  try {
    // 같은 배포 환경의 investor-ranking API 호출 (작동 검증 완료)
    const base =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

    const res = await fetch(`${base}/api/investor-ranking`, {
      headers: { "x-internal": "1" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`investor-ranking HTTP ${res.status}`);

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const buyData  = data.buy  as { foreign: RankItem[]; institution: RankItem[]; individual: RankItem[] };
    const sellData = data.sell as { foreign: RankItem[]; institution: RankItem[]; individual: RankItem[] };

    // buy items have positive netBuyAmount, sell items have negative
    const foreign     = sumAmounts(buyData.foreign)     + sumAmounts(sellData.foreign);
    const institution = sumAmounts(buyData.institution) + sumAmounts(sellData.institution);
    const individual  = sumAmounts(buyData.individual)  + sumAmounts(sellData.individual);

    const flow: FlowItem[] = [
      { type: "foreign",     label: "외국인", netBuy: foreign,     buy: 0, sell: 0 },
      { type: "institution", label: "기관",   netBuy: institution, buy: 0, sell: 0 },
      { type: "individual",  label: "개인",   netBuy: individual,  buy: 0, sell: 0 },
    ];

    // NOTE: investor-ranking은 KOSPI/KOSDAQ 구분 없이 sosok=01 사용
    // 두 시장 동일한 데이터를 표시 (추후 개선 가능)
    return NextResponse.json({ market, flow, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { error: "투자자 동향 데이터를 불러올 수 없습니다", debug: String(e) },
      { status: 500 }
    );
  }
}
