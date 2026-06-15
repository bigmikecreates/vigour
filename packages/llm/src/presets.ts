export type ProviderId =
  | "ollama"
  | "deepseek"
  | "kimi"
  | "openrouter"
  | "groq"
  | "openai"
  | "claude";

export interface ProviderPreset {
  id: ProviderId;
  kind: "openai-compatible" | "anthropic";
  /** Undefined for Anthropic (adapter uses its own default). */
  baseURL?: string;
  apiKeyEnv: string;
  defaultModel: string;
  modelEnv: string;
  /** Local => no network cost, billed at $0. */
  local?: boolean;
  label: string;
}

/**
 * Defaults verified June 2026. Model IDs move fast — override with the
 * matching *_MODEL env var rather than editing here.
 */
export const PRESETS: Record<ProviderId, ProviderPreset> = {
  // FREE / LOCAL — run a model on your own machine, $0 per call.
  ollama: {
    id: "ollama",
    kind: "openai-compatible",
    baseURL: "http://localhost:11434/v1",
    apiKeyEnv: "OLLAMA_API_KEY",
    defaultModel: "llama3.1",
    modelEnv: "VIGOUR_OLLAMA_MODEL",
    local: true,
    label: "Ollama (local)",
  },
  // CHEAP hosted.
  deepseek: {
    id: "deepseek",
    kind: "openai-compatible",
    baseURL: "https://api.deepseek.com", // /v1 alias also works
    apiKeyEnv: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-v4-flash", // legacy deepseek-chat retires 2026-07-24
    modelEnv: "VIGOUR_DEEPSEEK_MODEL",
    label: "DeepSeek",
  },
  kimi: {
    id: "kimi",
    kind: "openai-compatible",
    baseURL: "https://api.moonshot.ai/v1",
    apiKeyEnv: "MOONSHOT_API_KEY",
    defaultModel: "kimi-k2.6",
    modelEnv: "VIGOUR_KIMI_MODEL",
    label: "Kimi (Moonshot)",
  },
  // Aggregators with free tiers. Free model slugs change — set the *_MODEL env.
  openrouter: {
    id: "openrouter",
    kind: "openai-compatible",
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    defaultModel: "deepseek/deepseek-chat-v3:free", // verify a current :free slug
    modelEnv: "VIGOUR_OPENROUTER_MODEL",
    label: "OpenRouter",
  },
  groq: {
    id: "groq",
    kind: "openai-compatible",
    baseURL: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile", // verify current Groq model id
    modelEnv: "VIGOUR_GROQ_MODEL",
    label: "Groq",
  },
  // Paid baselines.
  openai: {
    id: "openai",
    kind: "openai-compatible",
    baseURL: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    modelEnv: "VIGOUR_OPENAI_MODEL",
    label: "OpenAI",
  },
  claude: {
    id: "claude",
    kind: "anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    defaultModel: "claude-haiku-4-5", // cheapest current Claude
    modelEnv: "VIGOUR_CLAUDE_MODEL",
    label: "Claude (Anthropic)",
  },
};

export const PROVIDER_IDS = Object.keys(PRESETS) as ProviderId[];

export function isProviderId(value: string): value is ProviderId {
  return value in PRESETS;
}
