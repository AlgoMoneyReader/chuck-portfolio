// 웹 푸시 공개키(VAPID public key). 공개돼도 되는 값 — 비밀키는 Vercel 환경변수 VAPID_PRIVATE_KEY 에만 둔다
export const VAPID_PUBLIC_KEY = "BIaiDzyoLe81g0fnQsDotBH2WH2XTVZmGrFQiAKtMJ0V6d5F7qpDWOepX_OfYzkh7dUVd3MqJKoxxrfx2wwoCbQ";
export interface PushPrefs { insight: boolean; idx: boolean; watch: boolean; close: boolean }
