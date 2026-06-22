import type { WebClient } from "@slack/web-api";
import type { LlmProvider } from "@vigour/llm";
import type { VigourAction } from "@vigour/actions";
import {
  summarizeUnread,
  readMentions,
  draftReply,
  sendMessage,
  broadcastMessage,
} from "./slack-api/index.js";
import { readFileAction, listDirectory, searchFiles } from "./filesystem/index.js";

export interface ExecuteContext {
  client: WebClient;
  userClient: WebClient | null;
  llm: LlmProvider | null;
  userId: string;
}

export interface ExecutionResult {
  status: "executed" | "failed";
  target?: string;
  output?: string;
  errorMessage?: string;
}

export async function executeAction(
  action: VigourAction,
  ctx: ExecuteContext,
): Promise<ExecutionResult> {
  try {
    switch (action.type) {
      case "summarize_unread":  return await summarizeUnread(action.channelId, ctx);
      case "read_mentions":     return await readMentions(action.since, ctx);
      case "draft_reply":       return await draftReply(action, ctx);
      case "send_message":      return await sendMessage(action, ctx);
      case "broadcast_message": return await broadcastMessage(action, ctx);
      case "query_system":      return querySystem(action.query);
      case "read_file":         return await readFileAction(action.path);
      case "list_directory":    return await listDirectory(action.path);
      case "search_files":      return await searchFiles(action.directory, action.pattern);
      case "unrecognized":      return unrecognized(action);
      default: {
        const _x: never = action;
        return { status: "failed", errorMessage: `unknown action ${String(_x)}` };
      }
    }
  } catch (err) {
    let errorMessage = err instanceof Error ? err.message : String(err);
    const data = (err as any)?.data;
    if (data?.error === "not_in_channel") {
      errorMessage =
        "Bot is not a member of that channel. Either invite the bot with `/invite @Vigour`, or run `/vigour connect` so Vigour can post as you.";
    } else if (data?.needed) {
      errorMessage += ` — needed scope: "${data.needed}", provided: "${data.provided ?? "unknown"}"`;
    }
    return { status: "failed", errorMessage };
  }
}

// ── Pure JS handlers ──────────────────────────────────────────────────────

function querySystem(query: string): ExecutionResult {
  const now = new Date();
  const q = query.toLowerCase();
  let output: string;
  if (q.includes("time")) {
    output = `Current time: ${now.toLocaleTimeString("en-GB")}`;
  } else if (q.includes("date")) {
    output = `Today's date: ${now.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;
  } else {
    output = now.toLocaleString("en-GB");
  }
  return { status: "executed", output };
}

function unrecognized(
  action: Extract<VigourAction, { type: "unrecognized" }>,
): ExecutionResult {
  return {
    status: "executed",
    output: `I can't do that yet, sorry. Vigour currently handles: Slack messages & mentions, file reading, directory listing, file search, and system queries (time, date).`,
  };
}
