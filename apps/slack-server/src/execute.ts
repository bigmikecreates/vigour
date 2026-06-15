import type { WebClient } from "@slack/web-api";
import type { LlmProvider } from "@vigour/llm";
import type { SlackAction } from "@vigour/actions";

export interface ExecuteContext {
  client: WebClient;
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
  action: SlackAction,
  ctx: ExecuteContext,
): Promise<ExecutionResult> {
  try {
    switch (action.type) {
      case "summarize_unread":  return await summarizeUnread(action.channelId, ctx);
      case "read_mentions":     return await readMentions(action.since, ctx);
      case "draft_reply":       return await draftReply(action, ctx);
      case "send_message":      return await sendMessage(action, ctx);
      case "broadcast_message": return await broadcastMessage(action, ctx);
      default: {
        const _x: never = action;
        return { status: "failed", errorMessage: `unknown action ${String(_x)}` };
      }
    }
  } catch (err) {
    return { status: "failed", errorMessage: err instanceof Error ? err.message : String(err) };
  }
}

// ── action implementations ────────────────────────────────────────────────────

async function summarizeUnread(
  channelId: string | undefined,
  { client, llm }: ExecuteContext,
): Promise<ExecutionResult> {
  let texts: string[];
  let target: string;

  if (channelId) {
    const r = await client.conversations.history({ channel: channelId, limit: HISTORY_LIMIT });
    texts = extractTexts(r.messages);
    target = channelId;
  } else {
    // No channel specified — scan the bot's joined channels.
    const list = await client.conversations.list({
      types: "public_channel,private_channel",
      limit: CHANNEL_SCAN_LIMIT,
      exclude_archived: true,
    });
    const channels = list.channels ?? [];
    const nested = await Promise.all(
      channels.map(async (ch) => {
        if (!ch.id) return [];
        const r = await client.conversations.history({ channel: ch.id, limit: 20 });
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
  { client, userId }: ExecuteContext,
): Promise<ExecutionResult> {
  const mentionTag = `<@${userId}>`;
  // Default window: last 24 hours.
  const oldestTs = since
    ? String(new Date(since).getTime() / 1000)
    : String((Date.now() - 86_400_000) / 1000);

  const list = await client.conversations.list({
    types: "public_channel,private_channel",
    limit: CHANNEL_SCAN_LIMIT,
    exclude_archived: true,
  });

  const mentions: string[] = [];
  for (const ch of list.channels ?? []) {
    if (!ch.id) continue;
    const r = await client.conversations.history({
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
  action: Extract<SlackAction, { type: "draft_reply" }>,
  { client, llm }: ExecuteContext,
): Promise<ExecutionResult> {
  const thread = await client.conversations.replies({
    channel: action.channelId,
    ts: action.threadTs,
    limit: 20,
  });

  const threadText = extractTexts(thread.messages).join("\n");

  if (!llm) {
    return {
      status: "executed",
      target: action.channelId,
      output: `Draft (no LLM): ${action.text}`,
    };
  }

  const resp = await llm.complete({
    system:
      "You are Vigour, a Slack assistant. Draft a concise, professional reply based on the thread and the user's intent. Output only the reply text — no preamble.",
    messages: [
      { role: "user", content: `Thread:\n${threadText}\n\nIntent: ${action.text}` },
    ],
    maxTokens: 300,
  });

  return { status: "executed", target: action.channelId, output: `Draft:\n${resp.text.trim()}` };
}

async function sendMessage(
  action: Extract<SlackAction, { type: "send_message" }>,
  { client }: ExecuteContext,
): Promise<ExecutionResult> {
  const r = await client.chat.postMessage({ channel: action.channelId, text: action.text });
  return r.ok
    ? { status: "executed", target: action.channelId }
    : { status: "failed", target: action.channelId, errorMessage: String(r.error) };
}

async function broadcastMessage(
  action: Extract<SlackAction, { type: "broadcast_message" }>,
  { client }: ExecuteContext,
): Promise<ExecutionResult> {
  const results = await Promise.allSettled(
    action.channelIds.map((ch) => client.chat.postMessage({ channel: ch, text: action.text })),
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

// ── helpers ───────────────────────────────────────────────────────────────────

function extractTexts(messages: Array<{ text?: string }> | undefined): string[] {
  return (messages ?? []).map((m) => m.text?.trim() ?? "").filter(Boolean);
}
