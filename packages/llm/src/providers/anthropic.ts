import type { LlmProvider, LlmRequest, LlmResponse } from "../provider.js";

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface AnthropicConfig {
  name: string;
  apiKey: string;
  model: string;
  baseURL?: string;
}

export class AnthropicProvider implements LlmProvider {
  readonly name: string;
  readonly model: string;
  private readonly url: string;
  private readonly apiKey: string;

  constructor(cfg: AnthropicConfig) {
    this.name = cfg.name;
    this.model = cfg.model;
    this.apiKey = cfg.apiKey;
    this.url = (cfg.baseURL ?? "https://api.anthropic.com").replace(/\/$/, "") + "/v1/messages";
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 512,
        temperature: req.temperature ?? 0,
        system: req.system,
        messages: req.messages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`[${this.name}] HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");

    return {
      text,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
      model: this.model,
      provider: this.name,
    };
  }
}
