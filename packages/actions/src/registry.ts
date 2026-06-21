import type { RiskLevel } from "@vigour/shared";
import type { VigourActionType } from "./schemas.js";

export interface ActionMetadata {
  type: VigourActionType;
  description: string;
  risk: RiskLevel;
  requiresConfirmation: boolean;
  /** Slack OAuth scopes required. Empty for non-Slack actions. */
  scopes: string[];
}

/**
 * The registry maps every action type to its risk + permission metadata.
 * Typed as a total Record, so adding a new action type forces an entry here.
 */
export const actionRegistry: Record<VigourActionType, ActionMetadata> = {
  // ── Slack surface ───────────────────────────────────────────────────────────
  summarize_unread: {
    type: "summarize_unread",
    description: "Summarize recent messages in a Slack channel, or across all joined channels.",
    risk: "low",
    requiresConfirmation: false,
    scopes: ["channels:history", "groups:history"],
  },
  read_mentions: {
    type: "read_mentions",
    description: "Read Slack messages that mention the user.",
    risk: "low",
    requiresConfirmation: false,
    scopes: ["channels:history"],
  },
  draft_reply: {
    type: "draft_reply",
    description: "Draft (but do not send) a reply to a Slack thread.",
    risk: "medium",
    requiresConfirmation: false,
    scopes: [],
  },
  send_message: {
    type: "send_message",
    description: "Send a message to a Slack channel on the user's behalf.",
    risk: "high",
    requiresConfirmation: true,
    scopes: ["chat:write"],
  },
  broadcast_message: {
    type: "broadcast_message",
    description: "Send the same message to multiple Slack channels at once.",
    risk: "critical",
    requiresConfirmation: true,
    scopes: ["chat:write"],
  },
  // ── System surface ──────────────────────────────────────────────────────────
  query_system: {
    type: "query_system",
    description: "Answer a system query: current time, date, or datetime.",
    risk: "low",
    requiresConfirmation: false,
    scopes: [],
  },
  // ── Windows filesystem surface ──────────────────────────────────────────────
  read_file: {
    type: "read_file",
    description: "Read the contents of a file from the Windows filesystem.",
    risk: "medium",
    requiresConfirmation: false,
    scopes: [],
  },
  list_directory: {
    type: "list_directory",
    description: "List the files and folders in a Windows directory.",
    risk: "low",
    requiresConfirmation: false,
    scopes: [],
  },
  search_files: {
    type: "search_files",
    description: "Search for files matching a name pattern inside a directory.",
    risk: "low",
    requiresConfirmation: false,
    scopes: [],
  },
  // ── Fallback ────────────────────────────────────────────────────────────────
  unrecognized: {
    type: "unrecognized",
    description: "The request does not match any available action.",
    risk: "low",
    requiresConfirmation: false,
    scopes: [],
  },
};

export function getActionMetadata(type: VigourActionType): ActionMetadata {
  return actionRegistry[type];
}
