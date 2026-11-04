// 국내 주식 거래 시간대 (한국 시간, 평일)
// 08:00~08:50 NXT 프리마켓 · 08:50~09:00 개장 동시호가 · 09:00~15:20 정규장(KRX·NXT)
// 15:20~15:30 KRX 종가 동시호가 · 15:30~20:00 NXT 애프터마켓(KRX 시간외 단일가 16:00~18:00 포함) · 그 외 장 종료
export type KrSessionKey = "nxt-pre" | "auction-open" | "regular" | "auction-close" | "nxt-after" | "closed";
export interface KrSession { key: KrSessionKey; label: string; short: string; extended: boolean }

export function krSession(now = Date.now()): KrSession {
  const k = new Date(now + 9 * 3_600_000);
  const wd = k.getUTCDay(), m = k.getUTCHours() * 60 + k.getUTCMinutes();
  if (wd === 0 || wd === 6) return { key: "closed", label: "휴장", short: "휴장", extended: false };
  if (m >= 480 && m < 530) return { key: "nxt-pre", label: "NXT 프리마켓 (08:00~08:50)", short: "NXT 프리", extended: true };
  if (m >= 530 && m < 540) return { key: "auction-open", label: "개장 동시호가 (08:50~09:00)", short: "동시호가", extended: true };
  if (m >= 540 && m < 920) return { key: "regular", label: "정규장 (09:00~15:20)", short: "정규장", extended: false };
  if (m >= 920 && m < 930) return { key: "auction-close", label: "종가 동시호가 (15:20~15:30)", short: "동시호가", extended: false };
  if (m >= 930 && m < 1200) return { key: "nxt-after", label: "NXT 애프터마켓 (15:30~20:00)", short: "NXT 애프터", extended: true };
  return { key: "closed", label: m < 480 ? "장 시작 전" : "장 종료", short: "장 종료", extended: false };
}
