import type { RiskLevel, SessionId, UserId, EventId } from "@vigour/shared";
import type { VigourActionType } from "@vigour/actions";

export type ExecutionStatus = "pending" | "executed" | "skipped" | "failed";
export type ConfirmationResult = "not_required" | "approved" | "rejected" | "timed_out";

/** One audited interaction (spec §10). Maps 1:1 to the audit_log table. */
export interface AuditEvent {
  eventId: EventId;
  sessionId: SessionId;
  userId: UserId;
  timestamp: string; // ISO 8601
  inputTranscript: string;
  parsedIntent: string;
  actionType: VigourActionType | "unknown";
  riskLevel: RiskLevel;
  confirmationRequired: boolean;
  confirmationResult: ConfirmationResult;
  slackTarget?: string;
  executionStatus: ExecutionStatus;
  errorMessage?: string;
  // LLM provenance + spend (Phase 2). Optional: not every event uses an LLM.
  llmProvider?: string;
  llmModel?: string;
  tokensIn?: number;
  tokensOut?: number;
  estimatedCostUsd?: number | null;
}
