# 알읽남 - 증시 레이더 (chuck-portfolio)

국내·미국·아시아 증시를 한눈에 보는 웹 대시보드. 운영: 알읽남(알고리즘이 읽어주는 돈) 채널.
배포 주소: https://alliknam.vercel.app (Vercel, 서울 리전 icn1)

## 꼭 지킬 규칙

- **답변은 항상 한국어로.** 코드 주석도 한국어.
- **배포 규칙**: 작업은 `claude/remote-control-Y6TJn` 브랜치에 커밋·푸시만 해 둔다.
  사용자가 **"배포"** 또는 **"중간배포"**라고 할 때만 PR 을 만들고 squash merge 한다 (Vercel 배포 1회).
  - Vercel Hobby 플랜이라 배포 횟수를 아껴야 한다. `vercel.json` 에서 `claude/*` 브랜치 미리보기 배포는 꺼져 있다.
  - 머지 직후 다음 작업을 위해 브랜치를 새 main 으로 맞춘다:
    `git fetch origin main && git checkout -B claude/remote-control-Y6TJn origin/main && git push --force-with-lease -u origin claude/remote-control-Y6TJn`
- **로그인은 카카오만.** 카카오 권한은 `openid profile_nickname` (닉네임만). 이메일 등 개인정보는 받지 않는다.
  구글 로그인 등 이메일이 노출되는 방식은 쓰지 않는다.
- 토스증권 등 다른 앱은 **참고(벤치마킹)만, 그대로 베끼지 않는다.**
- 문구는 쉬운 말로. 투자 권유로 읽힐 표현은 피한다.

## 기술 스택

- Next.js 14 App Router + TypeScript, Tailwind (색은 CSS 변수 토큰: `navy-*`, `cyan-brand`, `gold`, `signal-green/red`)
  - 다크/라이트 테마: `html[data-theme]`. 첫 방문은 기기 설정을 따름 (`src/lib/themeScript.ts`, `src/lib/theme.tsx`)
- Supabase (인증·DB, RLS). 운영자 판별은 SQL 함수 `public.is_admin()`. 새 테이블 SQL 은 `supabase/*.sql` 에 두고
  `supabase/setup-all.sql` 에도 덧붙인 뒤 **사용자에게 SQL Editor 에서 실행해 달라고 안내**한다.
- 차트: lightweight-charts 4.2.3 (`src/components/CandleChart.tsx`), recharts
- AI: `src/lib/gemini.ts` 의 `gemini()` — `cheapFirst` 옵션이면 Gemini 먼저, 실패 시 Claude.
  비용이 큰 기능은 `unstable_cache` 로 서버 캐시를 둔다. AI 사용량은 관리자 화면에 기능·모델별로 기록된다.

## 데이터 소스

- 국내: 한국투자증권 Open API(KIS, 키 필요), 네이버 m.stock / polling(실시간) / finance.naver.com(ETF·ETN)
- 미국: Yahoo chart/spark (`src/lib/yahooDaily.ts` 로 전일 종가 보정), Nasdaq screener, SEC EDGAR
- 아시아: Yahoo, TWSE
- 블로그: `rss.blog.naver.com/alliknam.xml` (`/api/blog-feed`)
- 시간 계산은 모두 **한국시간(KST)** 기준. 휴장일은 `src/lib/marketHolidays.ts`, 세계 증시 시계는 `src/lib/marketClock.ts`.
- 장외 시간(NXT·애프터·프리·데이마켓)엔 장외 시세를 메인으로, 정규장 종가는 아래 줄에 보여준다.

## 화면 패턴

- 순위 표: PC 는 고른 열 너비 grid, 모바일은 첫 열(종목명) 고정 + 가로 스크롤 (`STICKY`, `ScrollTable`, `SwipeHint` in `MarketSummary.tsx`)
- 값이 바뀐 칸은 `key` 를 값으로 주고 `animate-tick` 으로 깜빡임
- 팝업은 바깥을 누르거나 ESC 로 닫힌다 (종목 상세 `StockView`, 지수 `ChartModal`)
- 첫 방문 안내: `src/components/TourGuide.tsx` (대상 요소에 `data-tour="..."`)
- 홈 화면에 추가 안내: `src/components/InstallGuide.tsx`
- 매매동향 기본 탭: 21:00~07:00(KST)는 미국, 그 외 국내 (`defaultRegion()` in `src/lib/krSession.ts`)

## 확인 방법

- `npx tsc --noEmit -p .` → `npx next lint` → `npx next build`
- 화면 확인은 Playwright(사전 설치됨)로 스크린샷. 외부 API 가 막힌 환경에선 `page.route()` 로 응답을 흉내 내고,
  **그 경우 실제 데이터로는 확인 못 했다고 사용자에게 분명히 말한다.**
- 다시 빌드한 뒤 스크린샷 스타일이 깨지면 예전 `next-server` 가 남은 것 — `pkill -f next-server` 후 새 포트로 띄운다.
- 모바일(390px)·PC(1280px), 라이트·다크 둘 다 본다.
