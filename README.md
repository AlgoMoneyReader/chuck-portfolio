# Chuck Portfolio — 알읽남 투자 대시보드

알고리즘이 읽어주는 돈(알읽남) 채널 PD Chuck의 개인 주식 포트폴리오 현황판.

## 기능

- **Market Pulse** — KOSPI, KOSDAQ, 환율, 반도체 시총비중 실시간 표시
- **Portfolio Status** — 총자산, 평가손익, 5/11·7월 자금 일정 D-day
- **Holdings Heatmap** — 국내 14종목 + 해외 9종목 수익률 히트맵 (호버 툴팁)
- **Action Plan** — 긴급/추천/관망/보유 4단계 우선순위 액션 카드
- **7월 자납 시뮬레이션** — 매도 후보 테이블 + 목표 조달 진행률
- **RIA 재투자 전략** — 안정형/공격형 포트폴리오 파이 차트
- **Final Verdict** — 한 문장 결론 + 핵심 액션 배지

## 기술 스택

- Next.js 14 (App Router, TypeScript)
- Tailwind CSS (커스텀 디자인 토큰)
- Recharts (파이 차트)
- 배포: Vercel

## 로컬 실행

```bash
npm install
npm run dev
# http://localhost:3000
```

## 데이터 업데이트

`src/data/portfolio.json`을 직접 수정합니다.

```json
{
  "lastUpdated": "2026-05-07T09:00:00+09:00",
  "totalAsset": 585023842,
  ...
}
```

주요 업데이트 필드:
- `lastUpdated` — 업데이트 시각 (ISO 8601)
- `totalAsset`, `totalProfit`, `totalProfitPct` — 전체 포트폴리오
- `domesticHoldings[].currentPrice` — 국내 종목 현재가
- `overseasHoldings[].currentPrice` — 해외 종목 현재가
- `marketPulse` — 시장 지표

## Vercel 배포

### 방법 1: Vercel CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

### 방법 2: GitHub 연동

1. `git init && git add . && git commit -m "init"`
2. GitHub에 push
3. vercel.com/new → GitHub 저장소 선택 → Deploy

### 환경 설정

별도 환경 변수 불필요. 정적 사이트로 빌드됩니다.

## 향후 로드맵

- **Phase 2**: 한국투자증권 / NH나무 OpenAPI 연동 (자동 현재가 업데이트)
- **Phase 3**: Claude API 자동 분석 (포트폴리오 리밸런싱 추천)
