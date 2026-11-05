// 세계 증시 시계 — 각 거래소 현지 시각과 지금 상태(장중·점심·프리/애프터·휴장), 다음 개장/마감까지 남은 시간
// 서머타임은 시간대(IANA) 계산으로 자동 반영. 나라별 공휴일 휴장은 아직 반영하지 않는다(주말·거래시간 기준)

export interface Session { from: string; to: string; kind: "regular" | "pre" | "post" | "day" | "lunch" }
export interface MarketDef { key: string; flag: string; name: string; city: string; tz: string; sessions: Session[]; weekendDays?: number[] }

// 시각은 현지 시간 "HH:MM". to 가 from 보다 작으면 자정을 넘긴다
export const MARKETS: MarketDef[] = [
  { key: "KR", flag: "🇰🇷", name: "한국", city: "서울", tz: "Asia/Seoul", sessions: [
    { from: "08:00", to: "08:50", kind: "pre" }, { from: "09:00", to: "15:30", kind: "regular" }, { from: "15:30", to: "20:00", kind: "post" },
  ] },
  { key: "US", flag: "🇺🇸", name: "미국", city: "뉴욕", tz: "America/New_York", sessions: [
    { from: "04:00", to: "09:30", kind: "pre" }, { from: "09:30", to: "16:00", kind: "regular" }, { from: "16:00", to: "20:00", kind: "post" },
    { from: "20:00", to: "04:00", kind: "day" }, // 데이마켓(한국 낮) — 일~목 밤
  ] },
  { key: "JP", flag: "🇯🇵", name: "일본", city: "도쿄", tz: "Asia/Tokyo", sessions: [
    { from: "09:00", to: "11:30", kind: "regular" }, { from: "11:30", to: "12:30", kind: "lunch" }, { from: "12:30", to: "15:30", kind: "regular" },
  ] },
  { key: "CN", flag: "🇨🇳", name: "중국", city: "상해", tz: "Asia/Shanghai", sessions: [
    { from: "09:30", to: "11:30", kind: "regular" }, { from: "11:30", to: "13:00", kind: "lunch" }, { from: "13:00", to: "15:00", kind: "regular" },
  ] },
  { key: "HK", flag: "🇭🇰", name: "홍콩", city: "홍콩", tz: "Asia/Hong_Kong", sessions: [
    { from: "09:30", to: "12:00", kind: "regular" }, { from: "12:00", to: "13:00", kind: "lunch" }, { from: "13:00", to: "16:00", kind: "regular" },
  ] },
  { key: "TW", flag: "🇹🇼", name: "대만", city: "타이베이", tz: "Asia/Taipei", sessions: [{ from: "09:00", to: "13:30", kind: "regular" }] },
  { key: "UK", flag: "🇬🇧", name: "영국", city: "런던", tz: "Europe/London", sessions: [{ from: "08:00", to: "16:30", kind: "regular" }] },
  { key: "DE", flag: "🇩🇪", name: "독일", city: "프랑크푸르트", tz: "Europe/Berlin", sessions: [{ from: "09:00", to: "17:30", kind: "regular" }] },
];

const KIND_LABEL: Record<Session["kind"], string> = { regular: "장중", pre: "프리마켓", post: "애프터마켓", day: "데이마켓", lunch: "점심 휴장" };

// 현지 요일(0=일)·분(0~1439)·표시용 시각
function local(tz: string, now: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map(x => [x.type, x.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday as string);
  const h = Number(p.hour) % 24, m = Number(p.minute);
  return { wd, min: h * 60 + m, hhmm: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
}
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const isWeekday = (wd: number) => wd >= 1 && wd <= 5;

// 세션 s 가 '요일 wd 의 분 min' 에 열려 있나 (자정 넘는 세션: 시작한 날 기준 요일)
function inSession(key: string, s: Session, wd: number, min: number): boolean {
  const a = toMin(s.from), b = toMin(s.to);
  if (a < b) return isWeekday(wd) && min >= a && min < b;
  // 자정 넘김(미국 데이마켓 20:00~04:00): 일~목 밤 시작
  const startDays = key === "US" ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 5];
  if (min >= a) return startDays.includes(wd);
  return startDays.includes((wd + 6) % 7) && min < b;
}

export interface ClockState {
  def: MarketDef; time: string; status: string; open: boolean; regular: boolean; next: string;
  short: string;              // 한 줄용(한국시간 기준): 장중이면 '마감 38분', 아니면 '23:30 개장' / '월 09:00 개장'
  barsKst: [number, number][]; // 오늘 정규장 구간(한국시간 분, 0~1440 넘으면 다음 날로 이어짐)
}

// 시간대의 UTC 대비 분 차이 (서머타임 반영)
function offsetMin(tz: string, now: Date): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return Math.round((asUtc - Math.floor(now.getTime() / 60000) * 60000) / 60000);
}
const KST_DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const kstHHMM = (d: Date) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const kstDay = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short" }).format(d);

const fmtDur = (m: number) => (m >= 60 * 24 ? `${Math.floor(m / 1440)}일 ${Math.floor((m % 1440) / 60)}시간` : m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`);

export function clockOf(def: MarketDef, now = new Date()): ClockState {
  const { wd, min, hhmm } = local(def.tz, now);
  const cur = def.sessions.find(s => inSession(def.key, s, wd, min));
  // 다음 변화 시각: 현지 요일·분을 직접 굴려 가며 상태가 바뀌는 지점을 찾는다 (경계가 모두 5분 단위라 5분씩, 최대 4일)
  const kindAt = (w: number, m: number) => def.sessions.find(s => inSession(def.key, s, w, m))?.kind ?? "closed";
  const nowKind = cur?.kind ?? "closed";
  let step = 0;
  const first = 5 - (min % 5);
  for (let d = first; d <= 4 * 1440; d += 5) {
    const tot = min + d, w = (wd + Math.floor(tot / 1440)) % 7, m = tot % 1440;
    if (kindAt(w, m) !== nowKind) { step = d; break; }
  }
  const nextKind = step ? kindAt((wd + Math.floor((min + step) / 1440)) % 7, (min + step) % 1440) : "closed";
  const nextLabel = nowKind === "regular" ? "마감까지" : nextKind === "regular" ? "개장까지" : nextKind === "closed" ? "종료까지" : `${KIND_LABEL[nextKind as Session["kind"]]}까지`;
  // 다음 정규장 시작까지(분) — 장 밖일 때만
  let toOpen = 0;
  if (nowKind !== "regular") {
    for (let d = 5 - (min % 5); d <= 5 * 1440; d += 5) {
      const tot = min + d;
      if (kindAt((wd + Math.floor(tot / 1440)) % 7, tot % 1440) === "regular") { toOpen = d - (d === 5 - (min % 5) ? 0 : 0); break; }
    }
  }
  const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : `${m}분`);
  let short = "";
  if (nowKind === "regular") short = `마감 ${hm(step)}`;
  else if (toOpen) {
    const at = new Date(Math.ceil(now.getTime() / 60000) * 60000 + toOpen * 60000);
    const sameDay = kstDay(at) === kstDay(now) || toOpen < 12 * 60;
    short = `${sameDay ? "" : KST_DAYS[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(kstDay(at))] + " "}${kstHHMM(at)} 개장`;
  }
  // 정규장 구간을 한국시간 분으로 (점심시간은 빠짐)
  const shift = offsetMin("Asia/Seoul", now) - offsetMin(def.tz, now);
  const barsKst = def.sessions.filter(x => x.kind === "regular").map(x => [toMin(x.from) + shift, toMin(x.to) + shift] as [number, number]);

  return {
    def, time: hhmm,
    status: cur ? KIND_LABEL[cur.kind] : isWeekday(wd) ? (min < toMin(def.sessions[0].from) ? "개장 전" : "마감") : "주말 휴장",
    open: !!cur && cur.kind !== "lunch", regular: cur?.kind === "regular",
    next: step ? `${nextLabel} ${fmtDur(step)}` : "",
    short, barsKst,
  };
}
