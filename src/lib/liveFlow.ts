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
  // 장 마감 후 KIS 에 오늘 확정치가 올라오면 true (가집계·창구 대신 확정치)
  final?: boolean; individualEok?: number | null;
}

const kstNow = () => new Date(Date.now() + 9 * 3_600_000);
function afterClose(): boolean {
  const k = kstNow(), m = k.getUTCHours() * 60 + k.getUTCMinutes();
  return ![0, 6].includes(k.getUTCDay()) && m >= 15 * 60 + 30;
}

// 오늘 확정 투자자별 순매수 (KIS 주식현재가 투자자, 백만원 → 억원). 아직 집계 전이면 null
async function todayConfirmed(code: string): Promise<{ f: number; o: number; p: number } | null> {
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-investor", "FHKST01010900", { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code });
    const today = kstNow().toISOString().slice(0, 10).replace(/-/g, "");
    const r = ((j.output ?? []) as Record<string, string>[]).find(x => x.stck_bsop_date === today);
    if (!r || r.frgn_ntby_tr_pbmn === "" || r.orgn_ntby_tr_pbmn === "") return null;
    const v = (x?: string) => Math.round(num(x) ?? 0) / 100;
    const filled = [r.frgn_ntby_qty, r.orgn_ntby_qty, r.prsn_ntby_qty].some(x => (num(x) ?? 0) !== 0);
    return filled ? { f: v(r.frgn_ntby_tr_pbmn), o: v(r.orgn_ntby_tr_pbmn), p: v(r.prsn_ntby_tr_pbmn) } : null;
  } catch { return null; }
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
  // 장 마감 후: 거래소 가집계는 14:30 이 마지막이라, 오늘 확정치가 나오면 그걸 쓴다
  if (afterClose()) {
    const c = await todayConfirmed(code);
    if (c) {
      return {
        available: true, final: true, asOf: "장마감 확정", nextSlot: null,
        foreignEok: c.f, institutionEok: c.o, individualEok: c.p, globalEok: null, globalQty: null,
        updatedAt: kstNow().toISOString().slice(11, 16),
      };
    }
  }
  const [est, price, gq] = await Promise.all([
    kisGet("/uapi/domestic-stock/v1/quotations/investor-trend-estimate", "HHPTJ04160200", { MKSC_SHRN_ISCD: code }),
    kisGet("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code }),
    foreignBroker(code),
  ]);
  const now = kstHM();
  const p = num(price.output?.stck_prpr) ?? 0;
  const globalEok = gq != null && p ? Math.round((gq * p) / 1e6) / 100 : null;
  const nextSlot = afterClose() ? null : SLOT_TIMES.find(t => t > now) ?? null;
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
