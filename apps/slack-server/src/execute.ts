import { readFile as fsReadFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { WebClient } from "@slack/web-api";
import type { LlmProvider } from "@vigour/llm";
import type { VigourAction } from "@vigour/actions";

export interface ExecuteContext {
  client: WebClient;
  userClient: WebClient | null; // user token — for reads + attributed writes
  llm: LlmProvider | null;
  userId: string;
}

export interface ExecutionResult {
  status: "executed" | "failed";
  target?: string;
  /** Human-readable output to surface to the user (summary, draft, etc.). */
  output?: string;
  errorMessage?: string;
}

const HISTORY_LIMIT = 50;
const CHANNEL_SCAN_LIMIT = 8;
const MENTION_SCAN_LIMIT = 100;

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

// ── helpers ───────────────────────────────────────────────────────────────────

async function resolveChannelId(
  nameOrId: string,
  client: WebClient,
): Promise<string | null> {
  // Slack IDs are uppercase alphanumeric starting with C/D/G/W
  if (/^[A-Z][A-Z0-9]{6,}$/.test(nameOrId)) return nameOrId;

  const name = nameOrId.replace(/^#/, "").toLowerCase();
  const list = await client.conversations.list({
    types: "public_channel,private_channel,mpim,im",
    exclude_archived: true,
  });
  return list.channels?.find((c) => c.name?.toLowerCase() === name)?.id ?? null;
}

// ── action implementations ────────────────────────────────────────────────────

async function summarizeUnread(
  channelId: string | undefined,
  ctx: ExecuteContext,
): Promise<ExecutionResult> {
  const reader = ctx.userClient ?? ctx.client;
  const { llm } = ctx;
  let texts: string[];
  let target: string;

  if (channelId) {
    const resolvedId = await resolveChannelId(channelId, reader);
    if (!resolvedId) {
      return {
        status: "failed",
        errorMessage: `Channel "${channelId}" not found. Check the name and make sure Vigour has access.`,
      };
    }
    const r = await reader.conversations.history({ channel: resolvedId, limit: HISTORY_LIMIT });
    texts = extractTexts(r.messages);
    target = resolvedId;
  } else {
    // No channel specified — scan the user's (or bot's) joined channels.
    const list = await reader.conversations.list({
      types: "public_channel,private_channel",
      limit: CHANNEL_SCAN_LIMIT,
      exclude_archived: true,
    });
    const channels = list.channels ?? [];
    const nested = await Promise.all(
      channels.map(async (ch) => {
        if (!ch.id) return [];
        const r = await reader.conversations.history({ channel: ch.id, limit: 20 });
        return extractTexts(r.messages);
      }),
    );
    texts = nested.flat();
    target = channels.map((c) => c.id ?? "").filter(Boolean).join(",");
  }

  if (texts.length === 0) {
    return { status: "executed", target, output: "No recent messages found." };
  }

  if (!llm) {
    return {
      status: "executed",
      target,
      output: `${texts.length} recent messages found. Set VIGOUR_LLM_PROVIDER to get a summary.`,
    };
  }

  const resp = await llm.complete({
    system:
      "You are Vigour, a Slack assistant. Summarise the messages below in 3–5 bullet points. Focus on decisions, action items, and anything urgent. Be concise.",
    messages: [{ role: "user", content: texts.slice(0, 80).join("\n") }],
    maxTokens: 400,
  });

  return { status: "executed", target, output: resp.text.trim() };
}

async function readMentions(
  since: string | undefined,
  ctx: ExecuteContext,
): Promise<ExecutionResult> {
  const reader = ctx.userClient ?? ctx.client;
  const { userId } = ctx;
  const mentionTag = `<@${userId}>`;
  // Default window: last 24 hours.
  const oldestTs = since
    ? String(new Date(since).getTime() / 1000)
    : String((Date.now() - 86_400_000) / 1000);

  const list = await reader.conversations.list({
    types: "public_channel,private_channel",
    limit: CHANNEL_SCAN_LIMIT,
    exclude_archived: true,
  });

  const mentions: string[] = [];
  for (const ch of list.channels ?? []) {
    if (!ch.id) continue;
    const r = await reader.conversations.history({
      channel: ch.id,
      oldest: oldestTs,
      limit: MENTION_SCAN_LIMIT,
    });
    for (const msg of r.messages ?? []) {
      if (typeof msg.text === "string" && msg.text.includes(mentionTag)) {
        const clean = msg.text.replace(/<[^>]+>/g, "").trim();
        mentions.push(`#${ch.name ?? ch.id}: ${clean}`);
      }
    }
  }

  const output =
    mentions.length === 0
      ? "No mentions in the last 24 hours."
      : `${mentions.length} mention${mentions.length === 1 ? "" : "s"}:\n${mentions.join("\n")}`;

  return { status: "executed", output };
}

async function draftReply(
  action: Extract<VigourAction, { type: "draft_reply" }>,
  ctx: ExecuteContext,
): Promise<ExecutionResult> {
  const reader = ctx.userClient ?? ctx.client;
  const { llm } = ctx;
  const thread = await reader.conversations.replies({
    channel: action.channelId,
    ts: action.threadTs,
    limit: 20,
  });

  const threadText = extractTexts(thread.messages).join("\n");

  if (!llm) {
    const draft = ctx.userClient ? `${action.text}\n_— Vigour_` : action.text;
    return { status: "executed", target: action.channelId, output: `Draft (no LLM): ${draft}` };
  }

  const resp = await llm.complete({
    system:
      "You are Vigour, a Slack assistant. Draft a concise, professional reply based on the thread and the user's intent. Output only the reply text — no preamble.",
    messages: [
      { role: "user", content: `Thread:\n${threadText}\n\nIntent: ${action.text}` },
    ],
    maxTokens: 300,
  });

  const draftText = ctx.userClient
    ? `${resp.text.trim()}\n_— Vigour_`
    : resp.text.trim();
  return { status: "executed", target: action.channelId, output: `Draft:\n${draftText}` };
}

async function sendMessage(
  action: Extract<VigourAction, { type: "send_message" }>,
  ctx: ExecuteContext,
): Promise<ExecutionResult> {
  const poster = ctx.userClient ?? ctx.client;
  const text = ctx.userClient ? `${action.text}\n_— Vigour_` : action.text;
  const r = await poster.chat.postMessage({ channel: action.channelId, text });
  return r.ok
    ? { status: "executed", target: action.channelId }
    : { status: "failed", target: action.channelId, errorMessage: String(r.error) };
}

async function broadcastMessage(
  action: Extract<VigourAction, { type: "broadcast_message" }>,
  ctx: ExecuteContext,
): Promise<ExecutionResult> {
  const poster = ctx.userClient ?? ctx.client;
  const text = ctx.userClient ? `${action.text}\n_— Vigour_` : action.text;
  const results = await Promise.allSettled(
    action.channelIds.map((ch) => poster.chat.postMessage({ channel: ch, text })),
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failures = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => String(r.reason));

  if (succeeded === 0) {
    return {
      status: "failed",
      target: action.channelIds.join(","),
      errorMessage: failures.join("; "),
    };
  }

  const note = failures.length ? ` (${failures.length} failed: ${failures.join("; ")})` : "";
  return {
    status: "executed",
    target: action.channelIds.join(","),
    output: `Sent to ${succeeded}/${action.channelIds.length} channel${action.channelIds.length === 1 ? "" : "s"}${note}.`,
  };
}

async function unrecognized(
  action: Extract<VigourAction, { type: "unrecognized" }>,
): Promise<ExecutionResult> {
  return {
    status: "executed",
    output: `I can't do that yet, sorry. Vigour currently handles: Slack messages & mentions, file reading, directory listing, file search, and system queries (time, date).`,
  };
}

// ── System handlers ───────────────────────────────────────────────────────────

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

// ── Filesystem handlers ───────────────────────────────────────────────────────

function safePathCheck(p: string): ExecutionResult | null {
  if (p.includes("..")) {
    return { status: "failed", errorMessage: "Path traversal not allowed." };
  }
  return null;
}

async function readFileAction(filePath: string): Promise<ExecutionResult> {
  const guard = safePathCheck(filePath);
  if (guard) return guard;
  const content = await fsReadFile(filePath, "utf-8");
  const preview = content.length > 2000 ? content.slice(0, 2000) + "\n… (truncated)" : content;
  return { status: "executed", output: "```\n" + preview + "\n```" };
}

async function listDirectory(dirPath: string): Promise<ExecutionResult> {
  const guard = safePathCheck(dirPath);
  if (guard) return guard;
  const entries = await readdir(dirPath, { withFileTypes: true });
  const lines = entries.map((e) => (e.isDirectory() ? `📁 ${e.name}/` : `📄 ${e.name}`));
  return { status: "executed", output: lines.join("\n") || "Empty directory." };
}

async function searchFiles(directory: string, pattern: string): Promise<ExecutionResult> {
  const guard = safePathCheck(directory);
  if (guard) return guard;
  const regex = new RegExp(pattern.replace(/\*/g, ".*").replace(/\?/g, "."), "i");
  const entries = await readdir(directory, { withFileTypes: true });
  const matches = entries.filter((e) => regex.test(e.name)).map((e) => join(directory, e.name));
  return {
    status: "executed",
    output: matches.length ? matches.join("\n") : `No files matching "${pattern}" in ${directory}.`,
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function extractTexts(messages: Array<{ text?: string }> | undefined): string[] {
  return (messages ?? []).map((m) => m.text?.trim() ?? "").filter(Boolean);
}
