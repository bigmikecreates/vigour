import type { SlackAction } from "@vigour/actions";

/** standard = single yes/no; elevated = yes/no + typed challenge phrase. */
export type ConfirmationLevel = "standard" | "elevated";

export interface PendingConfirmation {
  id: string;
  sessionId: string;
  userId: string;
  action: SlackAction;
  level: ConfirmationLevel;
  /** Human-readable "I'm about to..." line read back to the user. */
  readBack: string;
  /** For elevated confirmations: the phrase the user must type back. */
  challenge?: string;
  createdAt: number;
  expiresAt: number;
  /** Opaque app payload (e.g. LLM provenance, transport coordinates). */
  data?: unknown;
}

export interface ConfirmationRequestInput {
  sessionId: string;
  userId: string;
  action: SlackAction;
  level: ConfirmationLevel;
  /** Override the auto-generated read-back if desired. */
  readBack?: string;
  data?: unknown;
}

export type ResolveStatus =
  | "approved"
  | "rejected"
  | "expired"
  | "not_found"
  | "challenge_failed";

export type ResolveResult =
  | { ok: true; status: "approved"; pending: PendingConfirmation }
  | { ok: false; status: Exclude<ResolveStatus, "approved">; pending?: PendingConfirmation };

/** Pluggable storage (in-memory now; Redis later for multi-instance). */
export interface ConfirmationStore {
  put(p: PendingConfirmation): Promise<void>;
  get(id: string): Promise<PendingConfirmation | undefined>;
  delete(id: string): Promise<void>;
  list(): Promise<PendingConfirmation[]>;
}
