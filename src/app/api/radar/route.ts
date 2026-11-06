import { NextResponse } from "next/server";
import { gemini, GeminiError, parseJsonLoose } from "@/lib/gemini";
import { requestUser, reserveQuota, refundQuota, type Quota } from "@/lib/supabase/requestUser";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";
export const maxDuration = 60;

/**
 * AI 레이더 분석 = 레이더(정량: 수급 Grade + 기술 지표) + AI(실적·밸류·뉴스·업황) 를 합친 하나의 종합 판단.
 * - GET ?code&name&market          → 오늘 이미 만든 분석이 있으면 돌려준다(무료). 없으면 report:null
 * - GET ...&run=1                  → 새로 생성(회원 하루 5회, 운영자 무제한). 같은 날 같은 종목은 모든 회원이 공유
 * - GET ...&run=1&force=1 (운영자) → 다시 생성해 덮어쓰기
 */

type J = Record<string, unknown>;
const KST = 9 * 3_600_000;
const kstDay = () => new Date(Date.now() + KST).toISOString().slice(0, 10);
const kstNow = () => new Date(Date.now() + KST).toISOString().slice(0, 16).replace("T", " ");

async function getJson(url: string, ms = 12_000): Promise<J | null> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    return r.ok ? ((await r.json()) as J) : null;
  } catch { return null; }
}
const eok = (v: unknown) => {
  const n = Number(v);
  if (!isFinite(n)) return "—";
  const a = Math.abs(n), s = n > 0 ? "+" : n < 0 ? "-" : "";
  return a >= 10000 ? `${s}${(a / 10000).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}조` : `${s}${Math.round(a).toLocaleString("ko-KR")}억`;
};

const SYSTEM = `당신은 '알읽남 AI 레이더'의 수석 애널리스트입니다. 정량 신호(수급·기술 지표)와 펀더멘털(실적·밸류에이션)·뉴스·업황을 하나로 묶어
일반 개인투자자가 바로 이해하고 행동할 수 있는 결론을 냅니다. 감정 배제, 데이터 근거, 짧고 명확한 한국어.
기술 지표 이름(RSI, MFI, CMF 등)은 결론에 쓰지 말고 '매수세가 강하다/약하다'처럼 쉬운 말로 풀어서 참고 근거로만 씁니다.`;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  const name = (url.searchParams.get("name") ?? code).trim();
  const market = url.searchParams.get("market") ?? "KS";
  const run = url.searchParams.get("run") === "1";
  const force = url.searchParams.get("force") === "1";
  if (!code) return NextResponse.json({ error: "code" }, { status: 400 });

  const me = await requestUser(request);
  if (!me) return NextResponse.json({ error: "로그인 후 이용할 수 있습니다", needLogin: true }, { status: 401 });
  const day = kstDay();
  const { data: st } = await me.sb.rpc("ai_quota_status");
  const quota = (st ?? {}) as Quota;

  // 오늘 이미 만든 분석 (모든 회원 공유)
  const { data: saved, error: savedErr } = await me.sb.from("radar_reports").select("report,created_at").eq("code", code).eq("day", day).maybeSingle();
  if (saved && !(force && quota.admin)) return NextResponse.json({ report: saved.report, cached: true, quota });
  if (!run) return NextResponse.json({ report: null, quota, storage: savedErr ? "missing" : "ok" });

  // 생성 전에 1회 차감 (동시 요청으로 한도 넘기기 방지). 실패하면 아래 catch 에서 돌려준다
  const reserve = await reserveQuota(me.sb);
  if (!reserve.ok) {
    return NextResponse.json({ error: `오늘 AI 레이더 분석 ${quota.limit ?? 5}회를 모두 사용했습니다. 다른 회원이 이미 분석한 종목은 계속 무료로 볼 수 있어요.`, quota }, { status: 429 });
  }

  // ── 1) 정량 데이터 수집 ─────────────────────────────────────────────────
  const o = url.origin, isUS = market === "US";
  const yahoo = isUS ? code.toUpperCase() : `${code}.${market}`;
  const [inv, tech, ov, qt, fin, news] = await Promise.all([
    isUS ? null : getJson(`${o}/api/stock-investor?code=${code}&market=${market}`),
    getJson(`${o}/api/stock-technicals?ticker=${encodeURIComponent(yahoo)}`),
    isUS ? null : getJson(`${o}/api/stock-overview?code=${code}`),
    isUS ? null : getJson(`${o}/api/stock-quarterly?code=${code}`, 15_000),
    isUS ? getJson(`${o}/api/stock-financials?ticker=${encodeURIComponent(yahoo)}`) : null,
    getJson(`${o}/api/stock-news?name=${encodeURIComponent(name)}`),
  ]);

  const supply = typeof inv?.score === "number" ? (inv.score as number) : null;
  const techScore = typeof tech?.techScore === "number" ? (tech.techScore as number) : null;
  const radarScore = supply != null && techScore != null ? Math.round(supply * 0.6 + techScore * 0.4) : supply ?? techScore;

  const lines: string[] = [];
  const quote = (ov?.quote ?? null) as J | null;
  if (quote) lines.push(`현재가 ${Number(quote.price).toLocaleString("ko-KR")}원 (${Number(quote.changePct) >= 0 ? "+" : ""}${quote.changePct}%), PER ${quote.per ?? "—"}, PBR ${quote.pbr ?? "—"}, 시총 ${eok(quote.marketCapEok)}, 52주 위치 ${quote.pos52 ?? "—"}% (고가 ${quote.high52} / 저가 ${quote.low52}), 업종 ${quote.sector ?? "—"}`);
  const cons = (ov?.consensus ?? null) as J | null;
  if (cons?.avgTarget) lines.push(`증권사 목표가 평균 ${Number(cons.avgTarget).toLocaleString("ko-KR")}원 (상승여력 ${cons.upsidePct}%, 리포트 ${cons.reports}건, 매수 ${cons.buy}·중립 ${cons.hold}·매도 ${cons.sell})`);
  if (inv) {
    lines.push(`수급 Grade ${inv.grade} (${inv.score}/100) — ${(inv.factors as J[] | undefined)?.map(f => `${f.label} ${f.score}/${f.max}(${f.desc})`).join(", ")}`);
    lines.push(`외국인 누적 5일 ${eok(inv.foreign5D)}·20일 ${eok(inv.foreign20D)}, 기관 누적 5일 ${eok(inv.institution5D)}·20일 ${eok(inv.institution20D)} (${(inv.flowBasis as J | undefined)?.label ?? ""})`);
  }
  const quarters = (qt?.quarters ?? []) as J[];
  if (quarters.length) lines.push("분기 실적(억원): " + quarters.slice(-5).map(q => `${q.period}${q.prelim ? "(잠정)" : ""} 매출 ${q.sales ?? "—"} 영업이익 ${q.op ?? "—"}(YoY ${q.opYoY ?? "—"}%)`).join(" / "));
  if (tech) lines.push(`기술 점수 ${tech.techScore}/100 — ` + ((tech.indicators ?? []) as J[]).map(i => `${i.label} ${i.display}(${i.grade})`).join(", "));
  if (fin) lines.push(`재무 점수 ${fin.finScore}/100 — ` + ((fin.metrics ?? []) as J[]).map(m => `${m.label ?? m.key} ${m.display ?? m.value}`).join(", "));
  const heads = ((news?.items ?? []) as J[]).slice(0, 12).map(n => `- ${n.title} (${n.source ?? ""} ${String(n.publishedAt ?? "").slice(0, 10)})`);

  const prompt = `오늘은 ${kstNow()} (한국시간)입니다. 종목: ${name} (${code}, ${isUS ? "미국" : market === "KQ" ? "코스닥" : "코스피"})
레이더 점수(정량: 수급 60% + 기술 40%): ${radarScore ?? "—"}/100

[정량 데이터 — 숫자는 여기 있는 값만 인용]
${lines.join("\n") || "(없음)"}

[최근 뉴스 헤드라인]
${heads.join("\n") || "(없음)"}

필요하면 웹 검색으로 이 종목의 최근 1개월 이내 실적·가이던스·업황·이슈만 확인하세요(날짜 명시). 오래된 정보는 쓰지 마세요.

과제: 레이더(단기 수급·흐름)와 펀더멘털·뉴스를 종합해 최종 판단을 내리세요.
- 단기 신호와 중장기 가치가 다르면 모순처럼 쓰지 말고 '대응 방법'으로 조율 (예: 중장기 우량 + 단기 수급 이탈 → 분할 매수)
- 수급 Grade D·F 이면 verdict 에 '매수'를 쓰지 말고 '분할매수' 이하로
- 일반인이 이해하는 쉬운 말. 지표 약어 대신 의미로 설명
- 숫자는 위 데이터나 검색으로 확인한 값만, 지어내지 말 것

JSON 만 반환:
{
 "verdict": "매수|분할매수|관망|비중축소|매도 중 하나",
 "aiScore": 0~100 정수 (종합 매력도),
 "headline": "한 줄 결론 (40자 이내)",
 "short": "단기(1~4주) 판단 한두 문장 — 수급·흐름 근거",
 "mid": "중장기(3~12개월) 판단 한두 문장 — 실적·밸류 근거",
 "reasons": [{"tag": "수급|실적|밸류|뉴스|업황|흐름 중 하나", "text": "근거 한 문장"}, ... 3~4개],
 "risks": ["리스크 한 문장", ... 2~3개],
 "strategy": {"entry": "진입 방법·가격대", "target": "목표가와 근거", "stop": "손절·재검토 조건"},
 "checkpoints": ["앞으로 확인할 이벤트(실적 발표일 등)", ... 1~3개]
}`;

  try {
    const { text, model } = await gemini({
      prompt, system: SYSTEM, search: true, timeoutMs: 40_000, effort: "low", maxTokens: 5000,
      log: { feature: "AI 레이더", userId: me.user.id, sb: me.sb, detail: `${name} ${code}` },
    });
    const ai = parseJsonLoose<J>(text);
    const report = {
      ...ai,
      code, name, market, model,
      generatedAt: new Date().toISOString(),
      radar: {
        score: radarScore, supply, tech: techScore,
        grade: inv?.grade ?? null,
        factors: inv?.factors ?? [],
        flows: inv ? {
          today: { foreign: inv.foreign, institution: inv.institution, individual: inv.individual, basis: (inv.flowBasis as J | undefined)?.label ?? null },
          d5: { foreign: inv.foreign5D, institution: inv.institution5D }, d20: { foreign: inv.foreign20D, institution: inv.institution20D },
        } : null,
        indicators: tech?.indicators ?? [],
      },
      price: quote ? { price: quote.price, changePct: quote.changePct } : null,
    };
    // 저장(공유) + 1회 차감. 저장 테이블이 없어도 결과는 돌려준다
    if (force && quota.admin) await me.sb.from("radar_reports").update({ report, created_at: new Date().toISOString() }).eq("code", code).eq("day", day);
    let saveErr: string | null = null;
    if (!(force && quota.admin)) {
      const { error } = await me.sb.from("radar_reports").insert({ code, day, report, created_by: me.user.id });
      saveErr = error ? error.message : null;
    }
    return NextResponse.json({ report, cached: false, quota: { ...quota, ...reserve.quota }, saveError: saveErr });
  } catch (e) {
    await refundQuota(me.sb);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, quota }, { status: e instanceof GeminiError && e.quota ? 429 : 500 });
  }
}
