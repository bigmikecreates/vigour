import "dotenv/config";
import http from "node:http";
import { randomUUID } from "node:crypto";
import bolt from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import { evaluate, type PolicyContext } from "@vigour/policy";
import { ConsoleAuditSink, type AuditEvent } from "@vigour/audit";
import { parseIntent, IntentParseError } from "@vigour/intent";
import type { VigourAction } from "@vigour/actions";
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

// Keyed by Slack userId — populated after the user completes /vigour connect.
const userClients = new Map<string, WebClient>();
const userNames = new Map<string, string>();

async function resolveUserName(userId: string, client?: WebClient): Promise<string> {
  if (userNames.has(userId)) return userNames.get(userId)!;
  try {
    const info = await (client ?? app.client).users.info({ user: userId });
    const name =
      (info.user as any)?.profile?.display_name_normalized ||
      (info.user as any)?.profile?.display_name ||
      (info.user as any)?.real_name ||
      (info.user as any)?.name ||
      userId;
    userNames.set(userId, name);
    return name;
  } catch {
    return userId;
  }
}

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

const flow = registerConfirmationFlow(app, { manager: confirmations, audit, llm, userClients });

interface ParseOutcome {
  action: VigourAction;
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

  // /vigour connect — start user OAuth flow
  if (command.text?.trim().toLowerCase() === "connect") {
    const link = `http://localhost:${env.PORT}/slack/oauth/start?state=${command.user_id}`;
    await respond(`*Connect your Slack account to Vigour*\n<${link}|Click here to authorise> — opens in your browser, then return to Slack.`);
    return;
  }

  const hasUserToken = userClients.has(command.user_id);
  const userName = await resolveUserName(command.user_id, userClients.get(command.user_id));
  console.log(
    `[vigour] command from ${userName} (${command.user_id}) in #${command.channel_name} — ` +
    `user token: ${hasUserToken ? "✓ connected" : "✗ not connected (run /vigour connect)"}`,
  );

  await respond({ text: "⏳ Processing…", response_type: "ephemeral" });

  const sessionId = randomUUID();
  const rawText = command.text?.trim() || "summarize my unread slack";
  // Prepend channel context so the LLM knows what "this channel" refers to.
  const transcript =
    `[Context: current Slack channel ID=${command.channel_id}, channel name=#${command.channel_name}]\n` +
    rawText;

  let outcome: ParseOutcome;
  try {
    outcome = await resolveIntent(transcript);
  } catch (err) {
    const message = err instanceof IntentParseError ? err.message : String(err);
    await audit.record(failureEvent(sessionId, command.user_id, rawText, message));
    await respond({ text: `*Vigour* couldn't parse that into an action.\n> ${message}`, replace_original: true });
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
        baseEvent(sessionId, command.user_id, rawText, outcome, decision.risk, {
          executionStatus: "skipped",
          errorMessage: decision.reason,
        }),
      );
      await respond({ text: `*Vigour* won't do that: ${decision.reason}`, replace_original: true });
      return;
    }
    const result = await executeAction(outcome.action, {
      client: app.client,
      userClient: userClients.get(command.user_id) ?? null,
      llm,
      userId: command.user_id,
    });
    await audit.record(
      baseEvent(sessionId, command.user_id, rawText, outcome, decision.risk, {
        executionStatus: result.status,
        slackTarget: result.target,
        errorMessage: result.errorMessage,
      }),
    );
    const lines = [
      "*Vigour*",
      "> " + rawText,
      "• intent: `" + outcome.action.type + "` → `" + decision.outcome + "` (" + result.status + ")",
      "• mind: `" + outcome.provider + "/" + outcome.model + "` · est cost: `" + fmtCost(outcome.costUsd) + "`",
    ];
    if (result.output) lines.push("", result.output);
    if (result.errorMessage) lines.push("", `⚠️ ${result.errorMessage}`);
    if (!userClients.has(command.user_id)) {
      lines.push("", "_Tip: `/vigour connect` gives Vigour access to your channels and unread messages._");
    }
    if (result.status === "executed") {
      await respond({ text: "✅ Done", replace_original: true });
      await new Promise((r) => setTimeout(r, 1000));
    }
    await respond({ text: lines.join("\n"), replace_original: true });
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
    text: pending.readBack,
    replace_original: true,
  });
});

flow.startSweep();

// ── OAuth HTTP server ─────────────────────────────────────────────────────────
// Socket Mode uses an outbound WebSocket — it doesn't bind to PORT — so this
// small HTTP server can occupy the port for the OAuth redirect flow.
const oauthServer = http.createServer(async (req, res) => {
  if (!req.url) { res.writeHead(400); res.end(); return; }
  const url = new URL(req.url, `http://localhost:${env.PORT}`);

  if (url.pathname === "/slack/oauth/start") {
    const state = url.searchParams.get("state") ?? "";
    const scopes = [
      "channels:history", "channels:read",
      "groups:history", "groups:read",
      "im:history", "mpim:history",
      "chat:write", "users:read",
    ].join(",");
    const authUrl =
      `https://slack.com/oauth/v2/authorize` +
      `?client_id=${encodeURIComponent(env.SLACK_CLIENT_ID)}` +
      `&user_scope=${encodeURIComponent(scopes)}` +
      `&redirect_uri=${encodeURIComponent(env.SLACK_OAUTH_REDIRECT_URI)}` +
      `&state=${encodeURIComponent(state)}`;
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  if (url.pathname === "/slack/oauth/callback") {
    const code = url.searchParams.get("code");
    if (!code) { res.writeHead(400); res.end("Missing code"); return; }
    try {
      const result = await app.client.oauth.v2.access({
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: env.SLACK_OAUTH_REDIRECT_URI,
      });
      const authedUser = (result as any).authed_user as { id?: string; access_token?: string } | undefined;
      const userId = authedUser?.id;
      const accessToken = authedUser?.access_token;
      if (userId && accessToken) {
        const uc = new WebClient(accessToken);
        userClients.set(userId, uc);
        const oauthName = await resolveUserName(userId, uc);
        console.log(`[vigour] ${oauthName} (${userId}) connected via OAuth.`);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h2>Connected!</h2><p>You can close this tab and return to Slack.</p>");
      } else {
        res.writeHead(400); res.end("OAuth error: missing token in response.");
      }
    } catch (err) {
      console.error("[vigour] OAuth callback error:", err);
      res.writeHead(500); res.end("OAuth exchange failed. Check server logs.");
    }
    return;
  }

  res.writeHead(404); res.end();
});

async function start(): Promise<void> {
  await app.start();
  oauthServer.listen(env.PORT);
  console.log("Vigour slack-server running (Socket Mode) on :" + env.PORT);
  await startupChecks();
}

async function startupChecks(): Promise<void> {
  console.log("\n─── Vigour Startup Checks ───────────────────────────");

  // Bot token / workspace
  try {
    const auth = await app.client.auth.test();
    console.log(`  Bot Token    ✓  @${auth.user} on ${auth.team} (${auth.url})`);
  } catch (err) {
    console.error(`  Bot Token    ✗  ${(err as Error).message}`);
  }

  // LLM
  if (llm) {
    console.log(`  LLM          ✓  ${llm.name} / ${llm.model}`);
  } else {
    console.warn("  LLM          ✗  No provider configured — set VIGOUR_LLM_PROVIDER in .env");
  }

  // OAuth (user tokens are runtime-only — remind the dev)
  console.log(`  User Tokens  ℹ  Populated at runtime via /vigour connect`);
  console.log(`  OAuth URL       http://localhost:${env.PORT}/slack/oauth/start`);

  console.log("─────────────────────────────────────────────────────\n");
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
