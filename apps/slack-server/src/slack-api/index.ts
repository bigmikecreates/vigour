import type { WebClient } from "@slack/web-api";
import type { LlmProvider } from "@vigour/llm";
import type { VigourAction } from "@vigour/actions";
import type { ExecuteContext, ExecutionResult } from "../execute.js";

const HISTORY_LIMIT = 50;
const CHANNEL_SCAN_LIMIT = 8;
const MENTION_SCAN_LIMIT = 100;

async function resolveChannelId(
  nameOrId: string,
  client: WebClient,
): Promise<string | null> {
  if (/^[A-Z][A-Z0-9]{6,}$/.test(nameOrId)) return nameOrId;

  const name = nameOrId.replace(/^#/, "").toLowerCase();
  const list = await client.conversations.list({
    types: "public_channel,private_channel,mpim,im",
    exclude_archived: true,
  });
  return list.channels?.find((c) => c.name?.toLowerCase() === name)?.id ?? null;
}

function extractTexts(messages: Array<{ text?: string }> | undefined): string[] {
  return (messages ?? []).map((m) => m.text?.trim() ?? "").filter(Boolean);
}

export async function summarizeUnread(
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
      "You are Vigour, a Slack assistant. Give a concise, natural summary of the messages below. Write as you would to a colleague — conversational, no rigid format. Surface what matters: decisions, blockers, action items.",
    messages: [{ role: "user", content: texts.slice(0, 80).join("\n") }],
    maxTokens: 400,
  });

  return { status: "executed", target, output: resp.text.trim() };
}

export async function readMentions(
  since: string | undefined,
  ctx: ExecuteContext,
): Promise<ExecutionResult> {
  const reader = ctx.userClient ?? ctx.client;
  const { userId } = ctx;
  const mentionTag = `<@${userId}>`;
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

export async function draftReply(
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

export async function sendMessage(
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

export async function broadcastMessage(
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
