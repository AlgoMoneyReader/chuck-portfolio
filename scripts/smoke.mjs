// 배포 전 자동 점검: 주요 화면을 열어 화면 오류(스크립트 에러)·빈 화면이 없는지 확인한다.
// 사용: npm run build && npm start (다른 창) → BASE=http://localhost:3000 node scripts/smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PAGES = [
  { path: "/", expect: "주요 지수" },
  { path: "/flow", expect: "매매동향" },
  { path: "/news", expect: "뉴스" },
  { path: "/calendar", expect: "캘린더" },
  { path: "/community", expect: "알읽남 인사이트" },
  { path: "/me", expect: "My" },
  { path: "/stock/005930", expect: "현황" },
  { path: "/stock/AAPL", expect: "현황" },
  { path: "/admin", expect: "운영자" },
];
// 외부 데이터가 막히거나 늦어서 생기는 것(네트워크)은 화면 오류로 보지 않는다
const IGNORE = /Failed to fetch|NetworkError|Load failed|AbortError|aborted|ERR_|net::/i;

const launch = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const browser = await chromium.launch(launch);
let failed = 0;
for (const [label, opts] of [["휴대폰", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }], ["PC", { viewport: { width: 1280, height: 860 } }]]) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => { try { localStorage.setItem("tour:off", "1"); localStorage.setItem("install:dismissed", String(Date.now())); } catch {} });
  for (const pg of PAGES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => { if (!IGNORE.test(String(e))) errors.push(String(e).slice(0, 200)); });
    let status = 0;
    try {
      const res = await page.goto(BASE + pg.path, { waitUntil: "domcontentloaded", timeout: 30000 });
      status = res?.status() ?? 0;
      await page.waitForTimeout(2500);
      const text = await page.locator("body").innerText();
      if (status >= 500) errors.push(`HTTP ${status}`);
      if (!text.includes(pg.expect)) errors.push(`'${pg.expect}' 글자가 화면에 없음 (빈 화면?)`);
    } catch (e) { errors.push(String(e).slice(0, 200)); }
    console.log(`${errors.length ? "❌" : "✅"} [${label}] ${pg.path}${errors.length ? "\n   - " + errors.join("\n   - ") : ""}`);
    if (errors.length) failed++;
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed}개 화면에 문제가 있습니다` : "\n모든 화면 정상");
process.exit(failed ? 1 : 0);
