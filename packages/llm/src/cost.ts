import type { LlmUsage } from "./provider.js";

/**
 * Approximate USD per 1M tokens (input, output). VERIFY against each provider's
 * pricing page before trusting the numbers — they change. Anything missing here
 * returns an unknown cost (tokens are still recorded).
 *
 * Sources (June 2026): Anthropic pricing; DeepSeek V4-Flash pricing.
 */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "deepseek-v4-flash": { input: 0.14, output: 0.28 },
  // Add openai / kimi / groq rates here as you adopt them.
};

export interface CostInfo {
  usd: number | null;
  known: boolean;
}

export function estimateCost(opts: {
  provider: string;
  model: string;
  usage: LlmUsage;
}): CostInfo {
  // Local providers (Ollama et al.) cost nothing per call.
  if (opts.provider === "ollama") return { usd: 0, known: true };

  const price = MODEL_PRICES[opts.model];
  if (!price) return { usd: null, known: false };

  const usd =
    (opts.usage.inputTokens / 1_000_000) * price.input +
    (opts.usage.outputTokens / 1_000_000) * price.output;
  return { usd, known: true };
}
