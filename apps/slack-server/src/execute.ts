import type { SlackAction } from "@vigour/actions";

export interface ExecutionResult {
  status: "executed" | "failed";
  target?: string;
  errorMessage?: string;
}

/**
 * Placeholder executor. Real Slack reads/writes land in later phases; for now
 * this just reports what *would* run, so the confirmation gate is exercised
 * end to end. The point of Phase 5 is that writes can't reach here un-approved.
 */
export async function executeAction(action: SlackAction): Promise<ExecutionResult> {
  switch (action.type) {
    case "summarize_unread":
      return { status: "executed", target: action.channelId };
    case "read_mentions":
      return { status: "executed" };
    case "draft_reply":
      return { status: "executed", target: action.channelId };
    case "send_message":
      return { status: "executed", target: action.channelId };
    case "broadcast_message":
      return { status: "executed", target: action.channelIds.join(",") };
    default: {
      const _exhaustive: never = action;
      return { status: "failed", errorMessage: `unknown action ${String(_exhaustive)}` };
    }
  }
}
