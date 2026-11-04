// Gemini 공용 호출. 무료 등급은 모델마다 일일 한도가 따로라서(2.5-flash 20회/일 등)
// 한도 초과(429)·장애가 나면 다음 모델로 넘어가고, 한도 걸린 모델은 잠시 건너뛴다.
// 순서: Claude Opus 5.5(ANTHROPIC_API_KEY 가 있을 때, 기본 엔진) → Gemini 무료 모델들 → Gemma
// 모든 호출은 ai_logs 에 모델·토큰·추정 비용을 남긴다(운영자 대시보드).
import { claudeAvailable, claudeGenerate, CLAUDE_MODEL, type AiUsage } from "./claude";
import { logAI, type AiLogCtx } from "./aiLog";

// 2.0-flash 는 지원 종료(404)라 뺐고, 최신 별칭 모델을 추가(한도 별도)
export const QUALITY = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-flash-lite-latest"];
export const CHEAP = ["gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.5-flash"];
// Gemma: 무료 한도가 훨씬 크지만 구글 검색·시스템 지시·JSON 모드가 없다 → 지시를 본문에 합쳐 보낸다
const GEMMA = "gemma-3-27b-it";

const cooldown = new Map<string, number>(); // model → 다시 시도해도 되는 시각

export interface GeminiOpts {
  prompt: string;
  system?: string;
  search?: boolean;          // 구글 검색 그라운딩
  json?: boolean;            // JSON 응답 강제(검색과 함께 못 씀)
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  models?: string[];
  log?: AiLogCtx;            // 누가·어떤 기능에서 썼는지
  effort?: "low" | "medium" | "high"; // Claude 사고 깊이
}

export class GeminiError extends Error {
  constructor(msg: string, public quota: boolean) { super(msg); }
}

export async function gemini(o: GeminiOpts): Promise<{ text: string; model: string }> {
  const r = await generate(o);
  await logAI(o.log, r.model, r.usage);
  return { text: r.text, model: r.model };
}

async function generate(o: GeminiOpts): Promise<{ text: string; model: string; usage: AiUsage }> {
  const key = process.env.GEMINI_API_KEY;
  const errors: string[] = [];
  let allQuota = true;
  if (claudeAvailable()) {
    try {
      const r = await claudeGenerate({
        prompt: o.json ? `${o.prompt}\n\nJSON 만 반환하세요.` : o.prompt, system: o.system, search: o.search,
        maxTokens: o.maxTokens ? Math.max(o.maxTokens, 1024) : 8000, timeoutMs: o.timeoutMs, effort: o.effort,
      });
      return { text: r.text, model: CLAUDE_MODEL, usage: r.usage };
    } catch (e) { errors.push(`claude: ${String(e).slice(0, 80)}`); allQuota = false; }
  }
  if (!key) throw new GeminiError(`AI 호출 실패 (${errors.join(" | ") || "API 키 없음"})`, false);
  const chain = [...(o.models ?? QUALITY), GEMMA];
  for (const model of chain) {
    if ((cooldown.get(model) ?? 0) > Date.now()) { errors.push(`${model}: 한도 대기`); continue; }
    const gemma = model.startsWith("gemma");
    const thinking = model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: model.includes("lite") ? 0 : 1024 } } : {};
    const text0 = gemma && o.system ? `${o.system}\n\n---\n\n${o.prompt}` : o.prompt;
    const body = {
      contents: [{ role: "user", parts: [{ text: gemma && o.json ? `${text0}\n\n반드시 JSON 만 반환하세요.` : text0 }] }],
      ...(o.system && !gemma ? { systemInstruction: { parts: [{ text: o.system }] } } : {}),
      ...(o.search && !gemma ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: {
        temperature: o.temperature ?? 0.3,
        ...(o.maxTokens ? { maxOutputTokens: o.maxTokens } : {}),
        ...(o.json && !o.search && !gemma ? { responseMimeType: "application/json" } : {}),
        ...thinking,
      },
    };
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
        cache: "no-store",
      });
      if (!res.ok) {
        const t = (await res.text()).slice(0, 300);
        if (res.status === 429) {
          // 일일 한도면 길게, 분당 한도면 짧게 쉰다
          cooldown.set(model, Date.now() + (/PerDay/i.test(t) ? 60 : 2) * 60_000);
        } else allQuota = false;
        errors.push(`${model}: HTTP ${res.status}`);
        continue;
      }
      const j = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } };
      const text = (j.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? "").join("").trim();
      if (!text) { allQuota = false; errors.push(`${model}: 빈 응답`); continue; }
      const u = j.usageMetadata ?? {};
      // 무료 등급이라 비용 0으로 기록
      return { text, model, usage: { input: u.promptTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), searches: o.search ? 1 : 0, costUsd: 0 } };
    } catch (e) {
      allQuota = false;
      errors.push(`${model}: ${String(e).slice(0, 80)}`);
    }
  }
  throw new GeminiError(
    allQuota ? "AI 무료 사용 한도를 모두 썼습니다. 한국시간 오후 4~5시에 초기화됩니다." : `AI 호출 실패 (${errors.join(" | ")})`,
    allQuota,
  );
}

export function parseJsonLoose<T = unknown>(text: string): T {
  const s = text.replace(/```json\n?|\n?```/g, "");
  const m = /\{[\s\S]*\}/.exec(s);
  return JSON.parse(m ? m[0] : s) as T;
}
