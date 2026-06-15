import type { RiskLevel } from "@vigour/shared";
import type { SlackActionType } from "./schemas.js";

export interface ActionMetadata {
  type: SlackActionType;
  description: string;
  risk: RiskLevel;
  requiresConfirmation: boolean;
  /** Slack OAuth scopes this action needs to run. */
  scopes: string[];
}

/**
 * The registry maps every action type to its risk + permission metadata.
 * Typed as a total Record, so adding a new action type forces an entry here.
 */
export const actionRegistry: Record<SlackActionType, ActionMetadata> = {
  summarize_unread: {
    type: "summarize_unread",
    description: "Summarize unread messages, optionally scoped to one channel.",
    risk: "low",
    requiresConfirmation: false,
    scopes: ["channels:history", "groups:history"],
  },
  read_mentions: {
    type: "read_mentions",
    description: "Read messages that mention the user.",
    risk: "low",
    requiresConfirmation: false,
    scopes: ["channels:history"],
  },
  draft_reply: {
    type: "draft_reply",
    description: "Draft (but do not send) a reply to a thread.",
    risk: "medium",
    requiresConfirmation: false,
    scopes: [],
  },
  send_message: {
    type: "send_message",
    description: "Send a message to a channel on the user's behalf.",
    risk: "high",
    requiresConfirmation: true,
    scopes: ["chat:write"],
  },
  broadcast_message: {
    type: "broadcast_message",
    description: "Send the same message to multiple channels at once (mass-message).",
    risk: "critical",
    requiresConfirmation: true,
    scopes: ["chat:write"],
  },
};

export function getActionMetadata(type: SlackActionType): ActionMetadata {
  return actionRegistry[type];
}
