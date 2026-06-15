import type { LlmMessage, LlmProvider, LlmRequest, LlmResponse } from "../provider.js";

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface OpenAICompatibleConfig {
  name: string;
  /** Base URL up to (not including) /chat/completions, e.g. https://api.deepseek.com */
  baseURL: string;
  apiKey: string;
  model: string;
}

/**
 * Works with any provider that speaks the OpenAI Chat Completions API.
 * Switching provider = changing baseURL + apiKey + model. Nothing else.
 */
export class OpenAICompatibleProvider implements LlmProvider {
  readonly name: string;
  readonly model: string;
  private readonly url: string;
  private readonly apiKey: string;

  constructor(cfg: OpenAICompatibleConfig) {
    this.name = cfg.name;
    this.model = cfg.model;
    this.url = cfg.baseURL.replace(/\/$/, "") + "/chat/completions";
    this.apiKey = cfg.apiKey;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const messages: LlmMessage[] = [
      ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
      ...req.messages,
    ];

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: req.temperature ?? 0,
      max_tokens: req.maxTokens ?? 512,
    };
    if (req.json) body.response_format = { type: "json_object" };

    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`[${this.name}] HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = (await res.json()) as OpenAIChatResponse;
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      model: this.model,
      provider: this.name,
    };
  }
}
