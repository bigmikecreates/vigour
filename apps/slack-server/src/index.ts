import "dotenv/config";
import { randomUUID } from "node:crypto";
import bolt from "@slack/bolt";
import { evaluate, type PolicyContext } from "@vigour/policy";
import { ConsoleAuditSink, type AuditEvent } from "@vigour/audit";
import { parseIntent, IntentParseError } from "@vigour/intent";
import type { SlackAction } from "@vigour/actions";
import {
  ConfirmationManager,
  InMemoryConfirmationStore,
  levelForOutcome,
} from "@vigour/confirm";
import { loadEnv } from "./env.js";
import { buildLlmProvider } from "./llm.js";
import { heuristicIntent } from "./intent.js";
import { executeAction } from "./execute.js";
import {
  registerConfirmationFlow,
  standardConfirmBlocks,
  elevatedConfirmBlocks,
  type ConfirmContext,
} from "./confirm-flow.js";

const { App } = bolt;

const env = loadEnv();
const audit = new ConsoleAuditSink();
const llm = buildLlmProvider();
const confirmations = new ConfirmationManager(new InMemoryConfirmationStore(), {
  ttlMs: 120_000,
});

console.log(
  llm
    ? `Vigour mind: ${llm.name} (${llm.model})`
    : "Vigour mind: heuristic fallback (set VIGOUR_LLM_PROVIDER to use an LLM)",
);

const app = new App({
  token: env.SLACK_BOT_TOKEN,
  appToken: env.SLACK_APP_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  socketMode: true,
});

const flow = registerConfirmationFlow(app, { manager: confirmations, audit, llm });

interface ParseOutcome {
  action: SlackAction;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

async function resolveIntent(transcript: string): Promise<ParseOutcome> {
  if (!llm) {
    return {
      action: heuristicIntent(transcript),
      provider: "heuristic",
      model: "none",
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    };
  }
  const r = await parseIntent(transcript, llm);
  return {
    action: r.action,
    provider: r.provider,
    model: r.model,
    tokensIn: r.usage.inputTokens,
    tokensOut: r.usage.outputTokens,
    costUsd: r.costUsd,
  };
}

/**
 * /vigour <text> — full pipeline with the Phase 5 confirmation gate:
 *
 *   allow   -> execute immediately
 *   confirm -> standard yes/no buttons (write actions)
 *   elevate -> typed-challenge modal (critical actions)
 *   deny    -> refuse
 */
app.command("/vigour", async ({ command, ack, respond }) => {
  await ack();

  const sessionId = randomUUID();
  const transcript = command.text?.trim() || "summarize my unread slack";

  let outcome: ParseOutcome;
  try {
    outcome = await resolveIntent(transcript);
  } catch (err) {
    const message = err instanceof IntentParseError ? err.message : String(err);
    await audit.record(failureEvent(sessionId, command.user_id, transcript, message));
    await respond(`*Vigour* couldn't parse that into an action.\n> ${message}`);
    return;
  }

  // Elevation is enabled for the demo so critical actions reach the elevated
  // flow rather than being flat-denied. Gate this per workspace/user in prod.
  const ctx: PolicyContext = {
    grantedScopes: ["channels:history", "groups:history", "chat:write"],
    elevated: true,
  };
  const decision = evaluate(outcome.action, ctx);
  const level = levelForOutcome(decision.outcome);

  const confirmData: ConfirmContext = {
    riskLevel: decision.risk,
    responseUrl: command.response_url,
    llmProvider: outcome.provider,
    llmModel: outcome.model,
    tokensIn: outcome.tokensIn,
    tokensOut: outcome.tokensOut,
    costUsd: outcome.costUsd,
  };

  // No confirmation needed: execute (allow) or refuse (deny) right now.
  if (level === null) {
    if (decision.outcome === "deny") {
      await audit.record(
        baseEvent(sessionId, command.user_id, transcript, outcome, decision.risk, {
          executionStatus: "skipped",
          errorMessage: decision.reason,
        }),
      );
      await respond(`*Vigour* won't do that: ${decision.reason}`);
      return;
    }
    const result = await executeAction(outcome.action, {
      client: app.client,
      llm,
      userId: command.user_id,
    });
    await audit.record(
      baseEvent(sessionId, command.user_id, transcript, outcome, decision.risk, {
        executionStatus: result.status,
        slackTarget: result.target,
        errorMessage: result.errorMessage,
      }),
    );
    const lines = [
      "*Vigour*",
      "> " + transcript,
      "• intent: `" + outcome.action.type + "` → `" + decision.outcome + "` (executed)",
      "• mind: `" + outcome.provider + "/" + outcome.model + "` · est cost: `" + fmtCost(outcome.costUsd) + "`",
    ];
    if (result.output) lines.push("", result.output);
    await respond(lines.join("\n"));
    return;
  }

  // Confirmation required: stage it and present the appropriate UI.
  const pending = await confirmations.request({
    sessionId,
    userId: command.user_id,
    action: outcome.action,
    level,
    data: confirmData,
  });

  await respond({
    blocks:
      level === "elevated"
        ? elevatedConfirmBlocks(pending)
        : standardConfirmBlocks(pending),
    text: pending.readBack, // fallback for notifications
  });
});

flow.startSweep();

async function start(): Promise<void> {
  await app.start(env.PORT);
  console.log("Vigour slack-server running (Socket Mode) on :" + env.PORT);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

// ── audit helpers ────────────────────────────────────────────────────────
function fmtCost(costUsd: number | null): string {
  return costUsd === null ? "unknown" : `$${costUsd.toFixed(6)}`;
}

function baseEvent(
  sessionId: string,
  userId: string,
  transcript: string,
  outcome: ParseOutcome,
  riskLevel: AuditEvent["riskLevel"],
  over: Partial<AuditEvent>,
): AuditEvent {
  return {
    eventId: randomUUID(),
    sessionId,
    userId,
    timestamp: new Date().toISOString(),
    inputTranscript: transcript,
    parsedIntent: outcome.action.type,
    actionType: outcome.action.type,
    riskLevel,
    confirmationRequired: false,
    confirmationResult: "not_required",
    executionStatus: "executed",
    llmProvider: outcome.provider,
    llmModel: outcome.model,
    tokensIn: outcome.tokensIn,
    tokensOut: outcome.tokensOut,
    estimatedCostUsd: outcome.costUsd,
    ...over,
  };
}

function failureEvent(
  sessionId: string,
  userId: string,
  transcript: string,
  message: string,
): AuditEvent {
  return {
    eventId: randomUUID(),
    sessionId,
    userId,
    timestamp: new Date().toISOString(),
    inputTranscript: transcript,
    parsedIntent: "unknown",
    actionType: "unknown",
    riskLevel: "low",
    confirmationRequired: false,
    confirmationResult: "not_required",
    executionStatus: "failed",
    errorMessage: message,
  };
}
