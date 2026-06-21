import { parseAction, type VigourAction } from "@vigour/actions";

/**
 * Zero-cost, no-LLM fallback used when VIGOUR_LLM_PROVIDER is unset. Lets the
 * server run offline. Real parsing happens in @vigour/intent (see index.ts).
 */
export function heuristicIntent(transcript: string): VigourAction {
  const s = transcript.toLowerCase();
  if (s.includes("mention")) return parseAction({ type: "read_mentions" });
  if (s.includes("broadcast") || s.includes("everyone") || s.includes("all channels"))
    return parseAction({
      type: "broadcast_message",
      channelIds: ["C_ENG", "C_GENERAL"],
      text: transcript,
    });
  if (s.includes("send"))
    return parseAction({ type: "send_message", channelId: "C_PLACEHOLDER", text: transcript });
  if (s.includes("draft") || s.includes("reply"))
    return parseAction({
      type: "draft_reply",
      channelId: "C_PLACEHOLDER",
      threadTs: "0",
      text: transcript,
    });
  return parseAction({ type: "unrecognized", originalQuery: transcript });
}
