# Vigour Build Plan

> Product spec of record. Code in this repo implements the architecture and
> phases described below. See `architecture.md` for the as-built pipeline.

## 1. Product Definition

**Name:** Vigour

**Concept:** Vigour is a voice-first visual Slack agent that lets users operate
Slack without relying on keyboard and mouse interaction.

**Core thesis:** Slack creates cognitive debt by forcing users to manually
navigate channels, threads, mentions, and messages. Vigour reduces that burden
by converting authenticated voice intent into observable, permissioned Slack
workflows.

**Primary goal:** Detach the user from Slack's manual interface while preserving
control, trust, and visibility.

## 2. Core User Experience — Startup Flow

1. User starts Vigour or says **"Hello, Vigour."**
2. Vigour authenticates: voice recognition, face recognition, lightweight
   liveness check.
3. On pass: unlock the Slack session, ask **"What would you like to do today?"**
4. On fail: limited retries, lockout on repeated failure, future email/SMS alert.

## 3. Main Interaction Flow

```
User speaks
-> speech-to-text
-> intent parser
-> action planner
-> policy/risk checker
-> confirmation if needed
-> Slack API execution
-> visual trace update
-> spoken response
```

## 4. Architecture

```
React/Next.js Frontend
        v
TypeScript API/Bolt Server
        v
Action Registry + Policy Engine
        v
Queue / Job Dispatcher
        v
Optional Python Agent Worker
        v
Slack API + Visual Agent Updates
```

## 5. Recommended Stack

- **Frontend:** TypeScript, React/Next.js, Rive or Lottie avatar, Web Speech API
  (MVP voice), WebSocket/SSE for live visual state.
- **Backend:** TypeScript, Slack Bolt JS, Fastify or NestJS, PostgreSQL audit
  logs, Redis later for jobs/session state.
- **Agent/Core:** typed action registry, LLM intent parser, policy/risk checker,
  confirmation manager, audit/event log.
- **Python sidecar (later):** long-running research, RAG, document/thread
  analysis, embeddings, evals, voice/vision, face/liveness detection.

## 6. MVP Scope

Prove that Vigour can: receive voice input; classify intent; execute safe Slack
actions; ask for confirmation before risky actions; display what it's doing;
log all actions for auditability.

MVP commands: summarize unread; read mentions; catch up on a channel; draft a
reply; send a message; show anything urgent today.

## 7. Action Risk Model

| Risk     | Example                    | Behaviour                               |
| -------- | -------------------------- | --------------------------------------- |
| Low      | Summarize unread messages  | Execute immediately                     |
| Medium   | Draft a reply              | Execute, but do not send                |
| High     | Send message to channel    | Require confirmation                    |
| Critical | Delete/export/mass-message | Require elevated confirmation or refuse |

Core rule: read-only runs immediately; writes require confirmation; destructive
or broad-scope actions require stronger validation.

## 8. Typed Action Registry

The LLM does not operate Slack directly. It outputs structured actions
(`summarize_unread`, `read_mentions`, `draft_reply`, `send_message`, ...) which
flow through: schema validation -> risk check -> permission check ->
confirmation check -> execution.

## 9. Visual Agent States

`idle, listening, thinking, checking_permissions, awaiting_confirmation,
executing, speaking, error, locked`. The visual layer reflects the Slack action
path; it does not literally control Slack by mouse clicks.

## 10. Audit Log

Every meaningful action is logged with: event_id, session_id, user_id,
timestamp, input_transcript, parsed_intent, action_type, risk_level,
confirmation_required, confirmation_result, slack_target, execution_status,
error_message.

## 11. Build Phases

1. **Slack Bot Foundation** — Bolt JS server, OAuth/scopes, message send,
   event listener, Socket Mode local dev.
2. **Typed Actions** — action registry, schema validation, intent->action
   mapping, risk levels, audit logging.
3. **Visual Frontend** — Next.js frontend, avatar placeholder, state machine,
   live visual trace via WebSocket/SSE.
4. **Voice Loop** — mic input, STT, spoken response, push-to-talk then wake word.
5. **Confirmations** — confirmation manager, read-back, yes/no, risk escalation.
6. **Authentication** — voice/face/liveness, attempt counter, temporary lockout.
7. **Research / Long-Running Tasks** — queue/dispatcher, Python FastAPI worker,
   research endpoint, summarization, result streaming, deeper audit logs.

## 12. Repo Structure

See the actual tree in this repository (`apps/`, `services/`, `packages/`,
`infra/`, `docs/`).

## 13. First Build Target

Open Vigour -> push-to-talk -> "summarize my unread Slack" -> visual trace ->
spoken summary -> audit log records the interaction.

## 14. Positioning

Vigour is a multimodal Slack execution agent that uses authenticated voice
commands, typed action planning, confirmation gates, and visual trace playback
to reduce cognitive overhead in workplace communication.
