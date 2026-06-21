import { z } from "zod";

/**
 * The LLM never touches external systems directly (spec §8). It emits one of
 * these structured actions, which are validated at runtime before anything runs.
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

// ── System surface ────────────────────────────────────────────────────────────

export const querySystemSchema = z.object({
  type: z.literal("query_system"),
  query: z.string(),
});

// ── Windows filesystem surface ────────────────────────────────────────────────

export const readFileSchema = z.object({
  type: z.literal("read_file"),
  path: z.string(),
});

export const listDirectorySchema = z.object({
  type: z.literal("list_directory"),
  path: z.string(),
});

export const searchFilesSchema = z.object({
  type: z.literal("search_files"),
  directory: z.string(),
  pattern: z.string(),
});

// ── Fallback ──────────────────────────────────────────────────────────────────

export const unrecognizedSchema = z.object({
  type: z.literal("unrecognized"),
  originalQuery: z.string(),
});

export const vigourActionSchema = z.discriminatedUnion("type", [
  summarizeUnreadSchema,
  readMentionsSchema,
  draftReplySchema,
  sendMessageSchema,
  broadcastMessageSchema,
  querySystemSchema,
  readFileSchema,
  listDirectorySchema,
  searchFilesSchema,
  unrecognizedSchema,
]);

export type VigourAction = z.infer<typeof vigourActionSchema>;
export type VigourActionType = VigourAction["type"];

/** Parse + validate raw LLM output into a typed action (throws on invalid). */
export function parseAction(input: unknown): VigourAction {
  return vigourActionSchema.parse(input);
}

/** Non-throwing variant for callers that want to branch on success. */
export function safeParseAction(input: unknown) {
  return vigourActionSchema.safeParse(input);
}
