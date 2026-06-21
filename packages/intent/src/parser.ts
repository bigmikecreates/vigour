import { safeParseAction, type VigourAction } from "@vigour/actions";
import { estimateCost, type LlmProvider, type LlmUsage } from "@vigour/llm";
import { buildSystemPrompt } from "./prompt.js";

export interface IntentResult {
  action: VigourAction;
  provider: string;
  model: string;
  usage: LlmUsage;
  costUsd: number | null;
  attempts: number;
}

export class IntentParseError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = "IntentParseError";
  }
}

/** Pull a JSON object out of a model reply, tolerating fences / stray prose. */
function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice);
}

/**
 * Turn a transcript into a validated SlackAction.
 *
 * The model only *proposes*; the proposal is validated against the Zod schema.
 * On invalid output the schema error is fed back for one (configurable) retry.
 * Token usage and estimated cost are returned so callers can audit spend.
 */
export async function parseIntent(
  transcript: string,
  provider: LlmProvider,
  opts?: { maxRetries?: number },
): Promise<IntentResult> {
  const system = buildSystemPrompt();
  const maxRetries = opts?.maxRetries ?? 1;

  let attempts = 0;
  let correction = "";
  let lastRaw = "";
  let model = provider.model;
  let providerName = provider.name;
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

  while (attempts <= maxRetries) {
    attempts++;
    const res = await provider.complete({
      system,
      messages: [
        { role: "user", content: correction ? `${transcript}\n\n${correction}` : transcript },
      ],
      json: true,
      temperature: 0,
      maxTokens: 256,
    });

    lastRaw = res.text;
    model = res.model;
    providerName = res.provider;
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;

    let candidate: unknown;
    try {
      candidate = extractJson(res.text);
    } catch {
      correction = "Your previous reply was not valid JSON. Return ONLY a JSON object.";
      continue;
    }

    const result = safeParseAction(candidate);
    if (result.success) {
      const cost = estimateCost({ provider: providerName, model, usage });
      return { action: result.data, provider: providerName, model, usage, costUsd: cost.usd, attempts };
    }

    correction =
      "Your previous reply did not match the schema: " +
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") +
      ". Return a corrected JSON object.";
  }

  throw new IntentParseError(
    `Failed to parse a valid action after ${attempts} attempt(s).`,
    lastRaw,
  );
}
