import Anthropic from "@anthropic-ai/sdk";

// Gemini 무료 한도가 모두 찼을 때 쓰는 예비 엔진. ANTHROPIC_API_KEY 가 설정된 경우에만 동작한다.
const MODEL = "claude-opus-5-5";

export const claudeAvailable = () => !!process.env.ANTHROPIC_API_KEY;

export async function claudeGenerate(o: { prompt: string; system?: string; search?: boolean; maxTokens?: number; timeoutMs?: number }): Promise<string> {
  const client = new Anthropic({ timeout: o.timeoutMs ?? 50_000, maxRetries: 1 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: o.prompt }];
  const tools: Anthropic.Beta.BetaToolUnion[] = o.search ? [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }] : [];

  // 웹 검색 중 pause_turn 이 오면 이어서 요청 (최대 3회)
  for (let i = 0; i < 3; i++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: o.maxTokens ?? 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      ...(o.system ? { system: o.system } : {}),
      ...(tools.length ? { tools } : {}),
      messages,
    });
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    if (res.stop_reason === "refusal") throw new Error("Claude 응답 거절");
    const text = res.content.map(b => (b.type === "text" ? b.text : "")).join("").trim();
    if (!text) throw new Error("Claude 빈 응답");
    return text;
  }
  throw new Error("Claude 응답 지연");
}
