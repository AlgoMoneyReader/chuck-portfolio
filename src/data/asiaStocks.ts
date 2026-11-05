// 아시아 시장별 대표 대형주 30 (대략 시가총액 순). Yahoo 심볼 · 한글 이름
export type AsiaMkt = "JP" | "TW" | "HK" | "CN";
export interface AsiaStock { s: string; ko: string }

export const ASIA_MARKETS: { key: AsiaMkt; label: string; flag: string; currency: string; sub: string }[] = [
  { key: "JP", label: "일본", flag: "🇯🇵", currency: "¥", sub: "도쿄증권거래소 · 09:00~15:30" },
  { key: "TW", label: "대만", flag: "🇹🇼", currency: "NT$", sub: "대만증권거래소 · 10:00~14:30" },
  { key: "HK", label: "홍콩", flag: "🇭🇰", currency: "HK$", sub: "홍콩거래소 · 10:30~17:00" },
  { key: "CN", label: "중국", flag: "🇨🇳", currency: "¥", sub: "상해·심천 · 10:30~16:00" },
];

export const ASIA_STOCKS: Record<AsiaMkt, AsiaStock[]> = {
  JP: [
    { s: "7203.T", ko: "토요타" }, { s: "8306.T", ko: "미쓰비시UFJ" }, { s: "6758.T", ko: "소니" }, { s: "9983.T", ko: "패스트리테일링" },
    { s: "6501.T", ko: "히타치" }, { s: "9984.T", ko: "소프트뱅크그룹" }, { s: "8035.T", ko: "도쿄일렉트론" }, { s: "6861.T", ko: "키엔스" },
    { s: "8316.T", ko: "미쓰이스미토모" }, { s: "285A.T", ko: "키옥시아" }, { s: "7011.T", ko: "미쓰비시중공업" }, { s: "6857.T", ko: "어드반테스트" }, { s: "9432.T", ko: "NTT" },
    { s: "7974.T", ko: "닌텐도" }, { s: "8058.T", ko: "미쓰비시상사" }, { s: "8001.T", ko: "이토추상사" }, { s: "4063.T", ko: "신에쓰화학" },
    { s: "6098.T", ko: "리크루트" }, { s: "8411.T", ko: "미즈호" }, { s: "8766.T", ko: "도쿄해상" }, { s: "9433.T", ko: "KDDI" },
    { s: "4502.T", ko: "다케다약품" }, { s: "7267.T", ko: "혼다" }, { s: "6902.T", ko: "덴소" }, { s: "4568.T", ko: "다이이치산쿄" },
    { s: "6367.T", ko: "다이킨" }, { s: "6981.T", ko: "무라타제작소" }, { s: "4519.T", ko: "주가이제약" }, { s: "7741.T", ko: "HOYA" },
    { s: "6146.T", ko: "디스코" }, { s: "6273.T", ko: "SMC" },
    { s: "4062.T", ko: "이비덴" }, { s: "6920.T", ko: "레이저텍" }, { s: "6723.T", ko: "르네사스" }, { s: "5803.T", ko: "후지쿠라" },
    { s: "7735.T", ko: "스크린홀딩스" }, { s: "6526.T", ko: "소시오넥스트" }, { s: "6963.T", ko: "롬" }, { s: "7012.T", ko: "가와사키중공업" },
    { s: "7013.T", ko: "IHI" }, { s: "6503.T", ko: "미쓰비시전기" }, { s: "8031.T", ko: "미쓰이물산" }, { s: "8053.T", ko: "스미토모상사" },
    { s: "9101.T", ko: "닛폰유센" }, { s: "4385.T", ko: "메루카리" }, { s: "3382.T", ko: "세븐&아이" }, { s: "7201.T", ko: "닛산" },
  ],
  TW: [
    { s: "2330.TW", ko: "TSMC" }, { s: "2317.TW", ko: "폭스콘(홍하이)" }, { s: "2454.TW", ko: "미디어텍" }, { s: "2308.TW", ko: "델타전자" },
    { s: "2382.TW", ko: "콴타컴퓨터" }, { s: "2881.TW", ko: "푸본금융" }, { s: "2882.TW", ko: "캐세이금융" }, { s: "2891.TW", ko: "CTBC금융" },
    { s: "3711.TW", ko: "ASE 테크놀로지" }, { s: "2412.TW", ko: "중화텔레콤" }, { s: "2345.TW", ko: "액톤" }, { s: "2303.TW", ko: "UMC" },
    { s: "6669.TW", ko: "위윈" }, { s: "2357.TW", ko: "에이수스" }, { s: "3231.TW", ko: "위스트론" }, { s: "2886.TW", ko: "메가금융" },
    { s: "2884.TW", ko: "E.SUN금융" }, { s: "2885.TW", ko: "위안타금융" }, { s: "3037.TW", ko: "유니마이크론" }, { s: "2379.TW", ko: "리얼텍" },
    { s: "1301.TW", ko: "포모사플라스틱" }, { s: "2327.TW", ko: "야교" }, { s: "3008.TW", ko: "라간정밀" }, { s: "3034.TW", ko: "노바텍" },
    { s: "2892.TW", ko: "퍼스트금융" }, { s: "5880.TW", ko: "타이완협동금융" }, { s: "1216.TW", ko: "유니프레지던트" }, { s: "2603.TW", ko: "에버그린해운" },
    { s: "2002.TW", ko: "차이나스틸" }, { s: "2301.TW", ko: "라이트온" },
    { s: "3661.TW", ko: "알칩" }, { s: "3443.TW", ko: "GUC" }, { s: "2383.TW", ko: "EMC(엘리트머티리얼)" }, { s: "3017.TW", ko: "AVC" },
    { s: "2408.TW", ko: "난야테크" }, { s: "2344.TW", ko: "윈본드" }, { s: "2449.TW", ko: "KYEC" }, { s: "2395.TW", ko: "어드밴텍" },
    { s: "2368.TW", ko: "골드서킷" }, { s: "3533.TW", ko: "로투스" }, { s: "2059.TW", ko: "킹슬라이드" }, { s: "2376.TW", ko: "기가바이트" },
    { s: "2356.TW", ko: "인벤텍" }, { s: "4938.TW", ko: "페가트론" }, { s: "2609.TW", ko: "양밍해운" },
  ],
  HK: [
    { s: "0700.HK", ko: "텐센트" }, { s: "9988.HK", ko: "알리바바" }, { s: "0939.HK", ko: "건설은행" }, { s: "1299.HK", ko: "AIA" },
    { s: "0005.HK", ko: "HSBC" }, { s: "1398.HK", ko: "공상은행" }, { s: "0941.HK", ko: "차이나모바일" }, { s: "3690.HK", ko: "메이투안" },
    { s: "1810.HK", ko: "샤오미" }, { s: "3988.HK", ko: "중국은행" }, { s: "2318.HK", ko: "핑안보험" }, { s: "0388.HK", ko: "홍콩거래소" },
    { s: "1211.HK", ko: "BYD" }, { s: "9618.HK", ko: "JD닷컴" }, { s: "0883.HK", ko: "CNOOC" }, { s: "9999.HK", ko: "넷이즈" },
    { s: "0857.HK", ko: "페트로차이나" }, { s: "2628.HK", ko: "중국인수보험" }, { s: "1024.HK", ko: "콰이쇼우" }, { s: "9888.HK", ko: "바이두" },
    { s: "0016.HK", ko: "신홍기부동산" }, { s: "2020.HK", ko: "안타스포츠" }, { s: "0001.HK", ko: "CK허치슨" }, { s: "0002.HK", ko: "CLP홀딩스" },
    { s: "0011.HK", ko: "항생은행" }, { s: "0027.HK", ko: "갤럭시엔터" }, { s: "1109.HK", ko: "화룬부동산" }, { s: "0688.HK", ko: "중국해외발전" },
    { s: "2382.HK", ko: "서니옵티컬" }, { s: "0981.HK", ko: "SMIC" },
    { s: "0175.HK", ko: "지리자동차" }, { s: "2015.HK", ko: "리오토" }, { s: "9868.HK", ko: "샤오펑" }, { s: "9866.HK", ko: "니오" },
    { s: "1347.HK", ko: "화훙반도체" }, { s: "2899.HK", ko: "쯔진광업" }, { s: "1088.HK", ko: "중국신화에너지" }, { s: "6690.HK", ko: "하이얼스마트홈" },
    { s: "9626.HK", ko: "빌리빌리" }, { s: "6160.HK", ko: "베이진" }, { s: "1801.HK", ko: "이노벤트" }, { s: "2269.HK", ko: "우시바이오" },
    { s: "0268.HK", ko: "킹디" }, { s: "6618.HK", ko: "JD헬스" }, { s: "0020.HK", ko: "센스타임" },
  ],
  CN: [
    { s: "600519.SS", ko: "구이저우마오타이" }, { s: "601398.SS", ko: "공상은행" }, { s: "300750.SZ", ko: "CATL" }, { s: "601288.SS", ko: "농업은행" },
    { s: "600036.SS", ko: "초상은행" }, { s: "601988.SS", ko: "중국은행" }, { s: "601857.SS", ko: "페트로차이나" }, { s: "600900.SS", ko: "장강전력" },
    { s: "601318.SS", ko: "핑안보험" }, { s: "000858.SZ", ko: "우량예" }, { s: "002594.SZ", ko: "BYD" }, { s: "601899.SS", ko: "쯔진광업" },
    { s: "600028.SS", ko: "시노펙" }, { s: "000333.SZ", ko: "메이디그룹" }, { s: "601628.SS", ko: "중국인수보험" }, { s: "688981.SS", ko: "SMIC" },
    { s: "300059.SZ", ko: "둥팡차이푸" }, { s: "600276.SS", ko: "헝루이제약" }, { s: "002475.SZ", ko: "럭스쉐어" }, { s: "600030.SS", ko: "중신증권" },
    { s: "601088.SS", ko: "중국신화에너지" }, { s: "000651.SZ", ko: "거리전기" }, { s: "002415.SZ", ko: "하이크비전" }, { s: "601166.SS", ko: "흥업은행" },
    { s: "600309.SS", ko: "완화화학" }, { s: "688256.SS", ko: "캠브리콘" }, { s: "601127.SS", ko: "싸이리스" }, { s: "600887.SS", ko: "이리" },
    { s: "300760.SZ", ko: "마인드레이" }, { s: "601012.SS", ko: "룽지그린에너지" },
    { s: "601138.SS", ko: "폭스콘인더스트리얼(FII)" }, { s: "300308.SZ", ko: "중지쉬촹" }, { s: "300502.SZ", ko: "신이성" }, { s: "002371.SZ", ko: "베이팡화촹" },
    { s: "688041.SS", ko: "하이광신식" }, { s: "000063.SZ", ko: "ZTE" }, { s: "600050.SS", ko: "차이나유니콤" }, { s: "603259.SS", ko: "우시앱텍" },
    { s: "601601.SS", ko: "중국태평양보험" }, { s: "600438.SS", ko: "퉁웨이" }, { s: "000725.SZ", ko: "BOE" }, { s: "601728.SS", ko: "차이나텔레콤" },
    { s: "600584.SS", ko: "창뎬과기" }, { s: "002230.SZ", ko: "아이플라이텍" }, { s: "601919.SS", ko: "코스코해운" },
  ],
};

// ── 검색: 한글 이름·코드로 찾고, 목록에 없는 종목도 거래소 접미사로 직접 입력 ─────────────
const MKT_LABEL: Record<AsiaMkt, string> = { JP: "일본", TW: "대만", HK: "홍콩", CN: "중국" };
export const asiaMarketOfSymbol = (sym: string): AsiaMkt | null => {
  const m = /\.(T|TW|TWO|HK|SS|SZ)$/i.exec(sym)?.[1]?.toUpperCase();
  return m === "T" ? "JP" : m === "TW" || m === "TWO" ? "TW" : m === "HK" ? "HK" : m === "SS" || m === "SZ" ? "CN" : null;
};
export interface AsiaHit { code: string; name: string; label: string }
export function searchAsia(q: string, limit = 8): AsiaHit[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const out: AsiaHit[] = [];
  for (const mk of Object.keys(ASIA_STOCKS) as AsiaMkt[]) {
    for (const x of ASIA_STOCKS[mk]) {
      const code = x.s.toLowerCase(), bare = code.replace(/\.[a-z]+$/, "");
      if (x.ko.toLowerCase().includes(t) || bare === t || code === t || (t.length >= 3 && bare.startsWith(t)))
        out.push({ code: x.s, name: x.ko, label: MKT_LABEL[mk] });
    }
  }
  const raw = q.trim().toUpperCase();
  const add = (sym: string, mk: AsiaMkt) => { if (!out.some(o => o.code === sym)) out.push({ code: sym, name: `${sym} (직접 입력)`, label: MKT_LABEL[mk] }); };
  if (/^[0-9A-Z]{3,6}\.(T|TW|TWO|HK|SS|SZ)$/.test(raw)) add(raw, asiaMarketOfSymbol(raw)!);
  else if (/^\d{3}[0-9A-Z]$/.test(raw)) { add(`${raw}.T`, "JP"); if (/^\d{4}$/.test(raw)) { add(`${raw}.TW`, "TW"); add(`${raw}.HK`, "HK"); } }
  else if (/^0\d{4}$/.test(raw)) add(`${raw.slice(1)}.HK`, "HK");
  else if (/^6\d{5}$/.test(raw)) add(`${raw}.SS`, "CN");
  return out.slice(0, limit);
}
