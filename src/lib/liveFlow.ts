import { kisGet, num } from "@/lib/kis";

// KIS 종목별 외국인·기관 장중 추정 가집계. 거래소가 정해진 시각에만 갱신하고 수량(주)만 준다 → 현재가로 금액(억원) 환산
const SLOT: Record<string, string> = { "1": "09:30", "2": "10:00", "3": "11:20", "4": "13:20", "5": "14:30" };
const SLOT_TIMES = ["09:30", "10:00", "11:20", "13:20", "14:30"];

export interface LiveFlow {
  available: boolean; asOf?: string; nextSlot?: string | null;
  foreignEok?: number; institutionEok?: number; foreignQty?: number; institutionQty?: number;
  // 외국계 증권사 창구 순매수: 체결마다 바뀌는 실시간 값(외국인 수급의 근사치)
  globalEok?: number | null; globalQty?: number | null;
  price?: number; updatedAt?: string; note?: string;
}

const kstHM = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(11, 16);

async function foreignBroker(code: string): Promise<number | null> {
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-member", "FHKST01010600", { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code });
    const o = (Array.isArray(j.output) ? j.output[0] : j.output) as Record<string, string> | undefined;
    if (!o) return null;
    const direct = num(o.glob_ntby_qty);
    if (direct != null) return direct;
    const b = num(o.glob_total_shnu_qty), s = num(o.glob_total_seln_qty);
    return b != null && s != null ? b - s : null;
  } catch { return null; }
}

export async function getLiveFlow(code: string): Promise<LiveFlow> {
  const [est, price, gq] = await Promise.all([
    kisGet("/uapi/domestic-stock/v1/quotations/investor-trend-estimate", "HHPTJ04160200", { MKSC_SHRN_ISCD: code }),
    kisGet("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code }),
    foreignBroker(code),
  ]);
  const now = kstHM();
  const p = num(price.output?.stck_prpr) ?? 0;
  const globalEok = gq != null && p ? Math.round((gq * p) / 1e6) / 100 : null;
  const nextSlot = SLOT_TIMES.find(t => t > now) ?? null;
  const rows = ((Array.isArray(est.output2) ? est.output2 : []) as Record<string, string>[])
    .filter(r => r.bsop_hour_gb && (r.frgn_fake_ntby_qty || r.orgn_fake_ntby_qty));
  if (!rows.length) {
    return { available: false, nextSlot, globalEok, globalQty: gq, price: p, updatedAt: now, note: "아직 장중 가집계가 나오지 않았습니다 (첫 집계 09:30)" };
  }
  const latest = rows.reduce((a, b) => (Number(b.bsop_hour_gb) > Number(a.bsop_hour_gb) ? b : a));
  const fq = num(latest.frgn_fake_ntby_qty) ?? 0, oq = num(latest.orgn_fake_ntby_qty) ?? 0;
  return {
    available: true,
    asOf: SLOT[latest.bsop_hour_gb] ?? latest.bsop_hour_gb,
    nextSlot,
    foreignQty: fq, institutionQty: oq,
    foreignEok: Math.round((fq * p) / 1e6) / 100, institutionEok: Math.round((oq * p) / 1e6) / 100,
    globalEok, globalQty: gq,
    price: p, updatedAt: now,
  };
}
