import {
  CascadeProvider,
  createProvider,
  isProviderId,
  PROVIDER_IDS,
  type LlmProvider,
  type ProviderId,
} from "@vigour/llm";

/**
 * Resolve the "mind" behind Vigour from the environment:
 *
 *   VIGOUR_LLM_PROVIDER   primary provider id (e.g. ollama, deepseek, kimi, claude)
 *   VIGOUR_LLM_FALLBACKS  optional comma list, tried in order if the primary fails
 *
 * Returns null when no provider is configured, so the server can fall back to a
 * zero-cost local heuristic for offline dev.
 */
export function buildLlmProvider(): LlmProvider | null {
  const primary = process.env.VIGOUR_LLM_PROVIDER?.trim();
  if (!primary) return null;

  if (!isProviderId(primary)) {
    throw new Error(
      `Unknown VIGOUR_LLM_PROVIDER "${primary}". Valid: ${PROVIDER_IDS.join(", ")}`,
    );
  }

  const ids: ProviderId[] = [primary];
  for (const raw of (process.env.VIGOUR_LLM_FALLBACKS ?? "").split(",")) {
    const id = raw.trim();
    if (id && isProviderId(id)) ids.push(id);
  }

  const providers = ids.map(createProvider);
  return providers.length === 1 ? providers[0]! : new CascadeProvider(providers);
}
