import type { LlmProvider, LlmRequest, LlmResponse } from "./provider.js";

/**
 * Tries providers in order, falling through to the next when one errors
 * (down, no key, rate-limited). Put your free/local provider first and a paid
 * one last so you only pay when the cheap option is unavailable.
 */
export class CascadeProvider implements LlmProvider {
  readonly name: string;
  readonly model: string;

  constructor(private readonly providers: LlmProvider[]) {
    if (providers.length === 0) {
      throw new Error("CascadeProvider needs at least one provider.");
    }
    this.name = providers.map((p) => p.name).join("->");
    this.model = providers[0]!.model;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    let lastErr: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.complete(req);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr ?? new Error("All providers failed.");
  }
}
