import Anthropic from "@anthropic-ai/sdk";

// 기본 AI 엔진. ANTHROPIC_API_KEY 가 설정된 경우에만 동작하고, 없거나 실패하면 Gemini 로 넘어간다.
export const CLAUDE_MODEL = "claude-opus-5-5";
// 가격 (USD): 입력 $4 / 출력 $20 (100만 토큰당), 웹 검색 $10 / 1,000회
const PRICE = { input: 4 / 1e6, output: 20 / 1e6, search: 10 / 1000 };

export const claudeAvailable = () => !!process.env.ANTHROPIC_API_KEY;

export interface AiUsage { input: number; output: number; searches: number; costUsd: number }

export async function claudeGenerate(o: { prompt: string; system?: string; search?: boolean; maxTokens?: number; timeoutMs?: number; effort?: "low" | "medium" | "high" }): Promise<{ text: string; usage: AiUsage }> {
  const client = new Anthropic({ timeout: o.timeoutMs ?? 50_000, maxRetries: 1 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: o.prompt }];
  const tools: Anthropic.Beta.BetaToolUnion[] = o.search ? [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }] : [];
  const usage: AiUsage = { input: 0, output: 0, searches: 0, costUsd: 0 };

  // 웹 검색 중 pause_turn 이 오면 이어서 요청 (최대 3회)
  for (let i = 0; i < 3; i++) {
    const res = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: o.maxTokens ?? 8000,
      // 안전 정책상 거절되면 서버가 다른 모델로 대신 답하게 한다
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: o.effort ?? "low" },
      ...(o.system ? { system: o.system } : {}),
      ...(tools.length ? { tools } : {}),
      messages,
    });
    usage.input += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
    usage.output += res.usage.output_tokens;
    usage.searches += res.usage.server_tool_use?.web_search_requests ?? 0;
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    if (res.stop_reason === "refusal") throw new Error("Claude 응답 거절");
    const text = res.content.map(b => (b.type === "text" ? b.text : "")).join("").trim();
    if (!text) throw new Error("Claude 빈 응답");
    usage.costUsd = usage.input * PRICE.input + usage.output * PRICE.output + usage.searches * PRICE.search;
    return { text, usage };
  }
  throw new Error("Claude 응답 지연");
}
