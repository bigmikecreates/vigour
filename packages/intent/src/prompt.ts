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
    "You convert a user's request into exactly ONE structured action.",
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
    '- {"type":"query_system","query":string}',
    '- {"type":"read_file","path":string}',
    '- {"type":"list_directory","path":string}',
    '- {"type":"search_files","directory":string,"pattern":string}',
    '- {"type":"unrecognized","originalQuery":string}',
    "",
    "Use unrecognized ONLY when the request cannot be handled by any action above.",
    "  Examples of unrecognized: opinions, jokes, 'book a flight', 'play music'",
    "  Examples that ARE handled: 'what time is it' → query_system, 'list my desktop' → list_directory",
    'If unrecognized, respond: {"type":"unrecognized","originalQuery":"<the user\'s exact query>"}',
    "When in doubt, prefer unrecognized over a weak match to a Slack action.",
  ].join("\n");
}
