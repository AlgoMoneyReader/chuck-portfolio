import { kisGet, num } from "@/lib/kis";

// KIS 종목별 외국인·기관 장중 추정 가집계. 거래소가 정해진 시각에만 갱신하고 수량(주)만 준다 → 현재가로 금액(억원) 환산
const SLOT: Record<string, string> = { "1": "09:30", "2": "10:00", "3": "11:20", "4": "13:20", "5": "14:30" };

export interface LiveFlow { available: boolean; asOf?: string; foreignEok?: number; institutionEok?: number; foreignQty?: number; institutionQty?: number; price?: number; note?: string }

export async function getLiveFlow(code: string): Promise<LiveFlow> {
  const [est, price] = await Promise.all([
    kisGet("/uapi/domestic-stock/v1/quotations/investor-trend-estimate", "HHPTJ04160200", { MKSC_SHRN_ISCD: code }),
    kisGet("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code }),
  ]);
  const rows = ((Array.isArray(est.output2) ? est.output2 : []) as Record<string, string>[])
    .filter(r => r.bsop_hour_gb && (r.frgn_fake_ntby_qty || r.orgn_fake_ntby_qty));
  if (!rows.length) return { available: false, note: "아직 장중 가집계가 나오지 않았습니다 (첫 집계 09:30)" };
  const latest = rows.reduce((a, b) => (Number(b.bsop_hour_gb) > Number(a.bsop_hour_gb) ? b : a));
  const p = num(price.output?.stck_prpr) ?? 0;
  const fq = num(latest.frgn_fake_ntby_qty) ?? 0, oq = num(latest.orgn_fake_ntby_qty) ?? 0;
  return {
    available: true,
    asOf: SLOT[latest.bsop_hour_gb] ?? latest.bsop_hour_gb,
    foreignQty: fq, institutionQty: oq,
    foreignEok: Math.round((fq * p) / 1e8), institutionEok: Math.round((oq * p) / 1e8),
    price: p,
  };
}
