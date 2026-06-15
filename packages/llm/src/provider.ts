/** A single chat turn. */
export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  /** System prompt (kept separate so the Anthropic adapter can map it). */
  system?: string;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider for JSON-mode output where supported. */
  json?: boolean;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  text: string;
  usage: LlmUsage;
  model: string;
  provider: string;
}

/**
 * The only thing the rest of Vigour depends on. Any backend that implements
 * this — paid, free, or local — is a drop-in "mind" for the agent.
 */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}
