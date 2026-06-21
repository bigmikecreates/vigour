import { getActionMetadata, type VigourAction } from "@vigour/actions";
import type { RiskLevel } from "@vigour/shared";

/**
 * What the policy engine decides to do with a proposed action.
 * - allow:   safe to run immediately (read-only / non-sending)
 * - confirm: run only after explicit user confirmation
 * - elevate: critical; requires elevated auth that has already been cleared
 * - deny:    blocked (missing scopes, or critical without elevation)
 */
export type PolicyOutcome = "allow" | "confirm" | "elevate" | "deny";

export interface PolicyDecision {
  outcome: PolicyOutcome;
  risk: RiskLevel;
  requiresConfirmation: boolean;
  reason: string;
}

export interface PolicyContext {
  /** Scopes the current Slack token actually holds. */
  grantedScopes: string[];
  /** Whether the user has cleared elevated auth for critical actions. */
  elevated?: boolean;
}

/**
 * Core gate (spec §7): read-only runs immediately, writes need confirmation,
 * destructive/broad-scope actions need stronger validation. Permission
 * (scope) checks always run first.
 */
export function evaluate(action: VigourAction, ctx: PolicyContext): PolicyDecision {
  const meta = getActionMetadata(action.type);

  const missing = meta.scopes.filter((s) => !ctx.grantedScopes.includes(s));
  if (missing.length > 0) {
    return {
      outcome: "deny",
      risk: meta.risk,
      requiresConfirmation: meta.requiresConfirmation,
      reason: `Missing Slack scopes: ${missing.join(", ")}`,
    };
  }

  switch (meta.risk) {
    case "low":
      return { outcome: "allow", risk: meta.risk, requiresConfirmation: false, reason: "Read-only action." };
    case "medium":
      return { outcome: "allow", risk: meta.risk, requiresConfirmation: false, reason: "Non-sending write (draft only)." };
    case "high":
      return { outcome: "confirm", risk: meta.risk, requiresConfirmation: true, reason: "Sends content on the user's behalf." };
    case "critical":
      return {
        outcome: ctx.elevated ? "elevate" : "deny",
        risk: meta.risk,
        requiresConfirmation: true,
        reason: ctx.elevated ? "Critical action with elevated auth." : "Critical action requires elevated auth.",
      };
  }
}
