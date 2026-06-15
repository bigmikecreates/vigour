import { actionRegistry } from "@vigour/actions";

/**
 * Compact system prompt derived from the action registry. Kept terse on
 * purpose — fewer tokens per call is a direct cost saving, and the deterministic
 * Zod validation downstream is what actually guarantees correctness.
 */
export function buildSystemPrompt(): string {
  const catalogue = Object.values(actionRegistry)
    .map((a) => `- ${a.type}: ${a.description}`)
    .join("\n");

  return [
    "You convert a user's Slack request into exactly ONE structured action.",
    "Respond with a single JSON object only — no prose, no markdown fences.",
    "",
    "Actions:",
    catalogue,
    "",
    "Shapes:",
    '- {"type":"summarize_unread","channelId"?:string}',
    '- {"type":"read_mentions","since"?:string}',
    '- {"type":"draft_reply","channelId":string,"threadTs":string,"text":string}',
    '- {"type":"send_message","channelId":string,"text":string}',
    '- {"type":"broadcast_message","channelIds":string[],"text":string}',
    "",
    "If the request is ambiguous, pick the safest read-only action.",
  ].join("\n");
}
