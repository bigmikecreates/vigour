/** Visual agent states (see product spec §9). */
export type VisualAgentState =
  | "idle"
  | "listening"
  | "thinking"
  | "checking_permissions"
  | "awaiting_confirmation"
  | "executing"
  | "speaking"
  | "error"
  | "locked";

export const AGENT_STATES: readonly VisualAgentState[] = [
  "idle",
  "listening",
  "thinking",
  "checking_permissions",
  "awaiting_confirmation",
  "executing",
  "speaking",
  "error",
  "locked",
] as const;
