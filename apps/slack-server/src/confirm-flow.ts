import type { App } from "@slack/bolt";
import type { KnownBlock } from "@slack/types";
import { randomUUID } from "node:crypto";
import type { ConfirmationManager, PendingConfirmation } from "@vigour/confirm";
import type { AuditSink, AuditEvent, ConfirmationResult, ExecutionStatus } from "@vigour/audit";
import type { RiskLevel } from "@vigour/shared";
import { executeAction } from "./execute.js";

/** App payload stashed on each pending confirmation (carries audit context). */
export interface ConfirmContext {
  riskLevel: RiskLevel;
  responseUrl?: string;
  llmProvider: string;
  llmModel: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

const ACTION_CONFIRM = "vigour_confirm";
const ACTION_CANCEL = "vigour_cancel";
const ACTION_ELEVATE_OPEN = "vigour_elevate_open";
const VIEW_ELEVATED = "vigour_elevated_modal";
const CHALLENGE_BLOCK = "vigour_challenge_block";
const CHALLENGE_INPUT = "vigour_challenge_input";

/** POST to a Slack response_url to replace the original confirmation message. */
async function replaceMessage(responseUrl: string | undefined, text: string): Promise<void> {
  if (!responseUrl) return;
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ replace_original: true, text }),
  }).catch(() => undefined);
}

/** Block Kit for a standard (single yes/no) confirmation. */
export function standardConfirmBlocks(p: PendingConfirmation): KnownBlock[] {
  return [
    { type: "section", text: { type: "mrkdwn", text: `*Confirm action*\n${p.readBack}` } },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          style: "primary",
          text: { type: "plain_text", text: "Confirm" },
          action_id: ACTION_CONFIRM,
          value: p.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Cancel" },
          action_id: ACTION_CANCEL,
          value: p.id,
        },
      ],
    },
  ];
}

/** Block Kit for an elevated confirmation (opens a typed-challenge modal). */
export function elevatedConfirmBlocks(p: PendingConfirmation): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:warning: *Critical action — elevated confirmation required*\n${p.readBack}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          style: "danger",
          text: { type: "plain_text", text: "Confirm (elevated)" },
          action_id: ACTION_ELEVATE_OPEN,
          value: p.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Cancel" },
          action_id: ACTION_CANCEL,
          value: p.id,
        },
      ],
    },
  ];
}

interface FlowDeps {
  manager: ConfirmationManager;
  audit: AuditSink;
}

/** Build the terminal audit event for a resolved confirmation. */
function terminalEvent(
  p: PendingConfirmation,
  confirmationResult: ConfirmationResult,
  executionStatus: ExecutionStatus,
  target?: string,
  errorMessage?: string,
): AuditEvent {
  const ctx = (p.data ?? {}) as Partial<ConfirmContext>;
  return {
    eventId: randomUUID(),
    sessionId: p.sessionId,
    userId: p.userId,
    timestamp: new Date().toISOString(),
    inputTranscript: p.readBack,
    parsedIntent: p.action.type,
    actionType: p.action.type,
    riskLevel: ctx.riskLevel ?? "high",
    confirmationRequired: true,
    confirmationResult,
    slackTarget: target,
    executionStatus,
    errorMessage,
    llmProvider: ctx.llmProvider,
    llmModel: ctx.llmModel,
    tokensIn: ctx.tokensIn,
    tokensOut: ctx.tokensOut,
    estimatedCostUsd: ctx.costUsd ?? null,
  };
}

/** Execute an approved action, audit it, and report back. */
async function runApproved(
  deps: FlowDeps,
  p: PendingConfirmation,
  report: (text: string) => Promise<void>,
): Promise<void> {
  const result = await executeAction(p.action);
  await deps.audit.record(
    terminalEvent(
      p,
      "approved",
      result.status,
      result.target,
      result.errorMessage,
    ),
  );
  await report(
    result.status === "executed"
      ? `:white_check_mark: Done — ${p.readBack}`
      : `:x: Failed — ${result.errorMessage ?? "unknown error"}`,
  );
}

/**
 * Register all confirmation interactions. Call once at startup. Returns a
 * `present` helper the command handler uses to kick off a confirmation, plus a
 * `sweep` for the timeout loop.
 */
export function registerConfirmationFlow(app: App, deps: FlowDeps) {
  const { manager } = deps;

  // Standard confirm.
  app.action(ACTION_CONFIRM, async ({ ack, body, respond }) => {
    await ack();
    const id = (body as { actions?: { value?: string }[] }).actions?.[0]?.value ?? "";
    const r = await manager.approve(id);
    if (!r.ok) {
      await respond({ replace_original: true, text: confirmFailureText(r.status) });
      return;
    }
    await runApproved(deps, r.pending, (text) => respond({ replace_original: true, text }));
  });

  // Cancel (standard or elevated).
  app.action(ACTION_CANCEL, async ({ ack, body, respond }) => {
    await ack();
    const id = (body as { actions?: { value?: string }[] }).actions?.[0]?.value ?? "";
    const r = await manager.reject(id);
    if (r.pending) {
      await deps.audit.record(terminalEvent(r.pending, "rejected", "skipped"));
    }
    await respond({ replace_original: true, text: ":no_entry: Cancelled — nothing was sent." });
  });

  // Elevated: open the typed-challenge modal.
  app.action(ACTION_ELEVATE_OPEN, async ({ ack, body, client }) => {
    await ack();
    const b = body as { actions?: { value?: string }[]; trigger_id?: string };
    const id = b.actions?.[0]?.value ?? "";
    const p = await manager.get(id);
    if (!p || !b.trigger_id) return;
    await client.views.open({
      trigger_id: b.trigger_id,
      view: {
        type: "modal",
        callback_id: VIEW_ELEVATED,
        private_metadata: id,
        title: { type: "plain_text", text: "Elevated confirm" },
        submit: { type: "plain_text", text: "Send" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${p.readBack}\n\nTo confirm this critical action, type *${p.challenge}* below.`,
            },
          },
          {
            type: "input",
            block_id: CHALLENGE_BLOCK,
            label: { type: "plain_text", text: "Confirmation code" },
            element: { type: "plain_text_input", action_id: CHALLENGE_INPUT },
          },
        ],
      },
    });
  });

  // Elevated: handle modal submission.
  app.view(VIEW_ELEVATED, async ({ ack, body, view }) => {
    const id = view.private_metadata;
    const typed =
      view.state.values?.[CHALLENGE_BLOCK]?.[CHALLENGE_INPUT]?.value ?? "";

    const p = await manager.get(id);
    const r = await manager.approve(id, { challengeResponse: typed });

    if (!r.ok) {
      // Re-show the input with an inline error rather than closing.
      if (r.status === "challenge_failed") {
        await ack({
          response_action: "errors",
          errors: { [CHALLENGE_BLOCK]: "That code doesn't match. Try again." },
        });
        return;
      }
      await ack();
      const url = ((p?.data ?? {}) as Partial<ConfirmContext>).responseUrl;
      await replaceMessage(url, confirmFailureText(r.status));
      return;
    }

    await ack();
    const url = ((r.pending.data ?? {}) as Partial<ConfirmContext>).responseUrl;
    await runApproved(deps, r.pending, (text) => replaceMessage(url, text));
  });

  return {
    /** Start a sweep loop that expires stale confirmations and audits them. */
    startSweep(intervalMs = 30_000): NodeJS.Timeout {
      return setInterval(() => {
        void (async () => {
          const expired = await manager.sweepExpired();
          for (const p of expired) {
            await deps.audit.record(terminalEvent(p, "timed_out", "skipped"));
            const url = ((p.data ?? {}) as Partial<ConfirmContext>).responseUrl;
            await replaceMessage(url, `:hourglass: Confirmation expired — ${p.readBack} was not sent.`);
          }
        })();
      }, intervalMs);
    },
  };
}

function confirmFailureText(status: string): string {
  switch (status) {
    case "expired":
      return ":hourglass: That confirmation expired. Ask again to retry.";
    case "not_found":
      return ":grey_question: That confirmation is no longer pending.";
    default:
      return `:warning: Could not confirm (${status}).`;
  }
}
