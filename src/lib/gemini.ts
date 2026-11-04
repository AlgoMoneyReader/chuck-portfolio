// Gemini 공용 호출. 무료 등급은 모델마다 일일 한도가 따로라서(2.5-flash 20회/일 등)
// 한도 초과(429)·장애가 나면 다음 모델로 넘어가고, 한도 걸린 모델은 잠시 건너뛴다.

export const QUALITY = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
export const CHEAP = ["gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash"];

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
}

export class GeminiError extends Error {
  constructor(msg: string, public quota: boolean) { super(msg); }
}

export async function gemini(o: GeminiOpts): Promise<{ text: string; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY 없음", false);
  const errors: string[] = [];
  let allQuota = true;
  for (const model of o.models ?? QUALITY) {
    if ((cooldown.get(model) ?? 0) > Date.now()) { errors.push(`${model}: 한도 대기`); continue; }
    const thinking = model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: model.includes("lite") ? 0 : 1024 } } : {};
    const body = {
      contents: [{ role: "user", parts: [{ text: o.prompt }] }],
      ...(o.system ? { systemInstruction: { parts: [{ text: o.system }] } } : {}),
      ...(o.search ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: {
        temperature: o.temperature ?? 0.3,
        ...(o.maxTokens ? { maxOutputTokens: o.maxTokens } : {}),
        ...(o.json && !o.search ? { responseMimeType: "application/json" } : {}),
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
      const j = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = (j.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? "").join("").trim();
      if (!text) { allQuota = false; errors.push(`${model}: 빈 응답`); continue; }
      return { text, model };
    } catch (e) {
      allQuota = false;
      errors.push(`${model}: ${String(e).slice(0, 80)}`);
    }
  }
  throw new GeminiError(
    allQuota ? "AI 일일 사용 한도를 모두 썼습니다. 잠시 후(한국시간 오후 4~5시 초기화) 다시 시도해 주세요." : `AI 호출 실패 (${errors.join(" | ")})`,
    allQuota,
  );
}

export function parseJsonLoose<T = unknown>(text: string): T {
  const s = text.replace(/```json\n?|\n?```/g, "");
  const m = /\{[\s\S]*\}/.exec(s);
  return JSON.parse(m ? m[0] : s) as T;
}
