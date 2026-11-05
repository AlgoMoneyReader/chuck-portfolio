// 아시아 주요 지수·선물·환율 — 카드 라벨 → Yahoo 심볼 (시세·스파크라인·차트가 같은 표를 쓴다)
export const ASIA: { key: string; label: string; symbol: string; sub: string; group: "index" | "futures" | "fx"; scale?: number }[] = [
  { key: "nikkei",   label: "닛케이 225",   symbol: "^N225",     sub: "일본 · 09:00~15:30",     group: "index" },
  { key: "twii",     label: "대만 가권",     symbol: "^TWII",     sub: "대만 · 10:00~14:30",     group: "index" },
  { key: "hsi",      label: "항셍",          symbol: "^HSI",      sub: "홍콩 · 10:30~17:00",     group: "index" },
  { key: "hscei",    label: "항셍 H지수",    symbol: "^HSCE",     sub: "홍콩 상장 중국기업",       group: "index" },
  { key: "shanghai", label: "상해종합",      symbol: "000001.SS", sub: "중국 · 10:30~16:00",     group: "index" },
  { key: "csi300",   label: "CSI 300",       symbol: "000300.SS", sub: "중국 대형주 300",          group: "index" },
  { key: "nikkeiFut", label: "닛케이 선물",  symbol: "NIY=F",     sub: "CME · 엔화 · 거의 24시간", group: "futures" },
  { key: "nikkeiFutUsd", label: "닛케이 선물($)", symbol: "NKD=F", sub: "CME · 달러",           group: "futures" },
  { key: "jpyKrw",   label: "엔/원 (100엔)", symbol: "JPYKRW=X",  sub: "100엔당 원",             group: "fx", scale: 100 },
  { key: "cnyKrw",   label: "위안/원",       symbol: "CNYKRW=X",  sub: "1위안당 원",             group: "fx" },
  { key: "twdKrw",   label: "대만달러/원",   symbol: "TWDKRW=X",  sub: "1대만달러당 원",         group: "fx" },
];
export const ASIA_SYMBOLS: Record<string, string> = Object.fromEntries(ASIA.map(a => [a.label, a.symbol]));
