/** Action risk tiers (see product spec §7). */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/** Ordinal ranking, handy for comparisons / escalation logic. */
export const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};
