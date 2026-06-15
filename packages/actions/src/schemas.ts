import { z } from "zod";

/**
 * The LLM never touches Slack directly (spec §8). It emits one of these
 * structured actions, which are validated at runtime before anything runs.
 */
export const summarizeUnreadSchema = z.object({
  type: z.literal("summarize_unread"),
  channelId: z.string().optional(),
});

export const readMentionsSchema = z.object({
  type: z.literal("read_mentions"),
  since: z.string().optional(),
});

export const draftReplySchema = z.object({
  type: z.literal("draft_reply"),
  channelId: z.string(),
  threadTs: z.string(),
  text: z.string(),
});

export const sendMessageSchema = z.object({
  type: z.literal("send_message"),
  channelId: z.string(),
  text: z.string(),
});

export const broadcastMessageSchema = z.object({
  type: z.literal("broadcast_message"),
  channelIds: z.array(z.string()).min(1),
  text: z.string(),
});

export const slackActionSchema = z.discriminatedUnion("type", [
  summarizeUnreadSchema,
  readMentionsSchema,
  draftReplySchema,
  sendMessageSchema,
  broadcastMessageSchema,
]);

export type SlackAction = z.infer<typeof slackActionSchema>;
export type SlackActionType = SlackAction["type"];

/** Parse + validate raw LLM output into a typed action (throws on invalid). */
export function parseAction(input: unknown): SlackAction {
  return slackActionSchema.parse(input);
}

/** Non-throwing variant for callers that want to branch on success. */
export function safeParseAction(input: unknown) {
  return slackActionSchema.safeParse(input);
}
