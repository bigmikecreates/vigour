import { PRESETS, type ProviderId } from "./presets.js";
import { OpenAICompatibleProvider } from "./providers/openai-compatible.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import type { LlmProvider } from "./provider.js";

/**
 * Build a configured provider from its id. Reads the API key + optional model
 * override from the environment. Local providers don't need a key.
 */
export function createProvider(id: ProviderId): LlmProvider {
  const preset = PRESETS[id];
  const apiKey = process.env[preset.apiKeyEnv] ?? (preset.local ? "ollama" : "");
  const model = process.env[preset.modelEnv] ?? preset.defaultModel;

  if (!apiKey && !preset.local) {
    throw new Error(`Missing ${preset.apiKeyEnv} for provider "${id}".`);
  }

  if (preset.kind === "anthropic") {
    return new AnthropicProvider({ name: id, apiKey, model });
  }

  const baseURL =
    id === "ollama" ? process.env.OLLAMA_BASE_URL ?? preset.baseURL! : preset.baseURL!;
  return new OpenAICompatibleProvider({ name: id, baseURL, apiKey, model });
}
