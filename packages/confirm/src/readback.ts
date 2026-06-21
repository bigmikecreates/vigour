import type { VigourAction } from "@vigour/actions";
import type { PolicyOutcome } from "@vigour/policy";
import type { ConfirmationLevel } from "./types.js";

/** Map a policy outcome to a confirmation level (or null if none is needed). */
export function levelForOutcome(outcome: PolicyOutcome): ConfirmationLevel | null {
  switch (outcome) {
    case "confirm":
      return "standard";
    case "elevate":
      return "elevated";
    case "allow":
    case "deny":
      return null;
  }
}

/** A natural-language "about to do X" line for read-back before acting. */
export function renderReadBack(action: VigourAction): string {
  switch (action.type) {
    case "summarize_unread":
      return action.channelId
        ? `Summarize unread messages in <#${action.channelId}>.`
        : "Summarize unread messages across your channels.";
    case "read_mentions":
      return action.since
        ? `Read your mentions since ${action.since}.`
        : "Read your mentions.";
    case "draft_reply":
      return `Draft a reply in <#${action.channelId}> (thread ${action.threadTs}): "${action.text}".`;
    case "send_message":
      return `Send to <#${action.channelId}>: "${action.text}".`;
    case "broadcast_message":
      return (
        `Broadcast to ${action.channelIds.length} channel(s) ` +
        `(${action.channelIds.map((c) => `<#${c}>`).join(", ")}): "${action.text}".`
      );
    case "query_system":
      return `Query system: ${action.query}.`;
    case "read_file":
      return `Read file: ${action.path}.`;
    case "list_directory":
      return `List directory: ${action.path}.`;
    case "search_files":
      return `Search for "${action.pattern}" in ${action.directory}.`;
    case "unrecognized":
      return `That request isn't something I can do yet.`;
    default: {
      const _exhaustive: never = action;
      return String(_exhaustive);
    }
  }
}
