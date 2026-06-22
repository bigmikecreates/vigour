---
name: vigour
description: >-
  Use when working on the Vigour Slack agent (apps/slack-server/). Covers
  monorepo layout, Windows development setup, Ollama model management,
  two-model parse split, action pipeline, execution groups, Slack manifest
  scopes, and troubleshooting common errors.
---

# Vigour

Voice-first visual Slack agent — authenticated voice commands → typed action planning → confirmation gates → visual trace → auditable execution.

> **Primary dev environment: Windows.** Mac/iOS/Android planned for later releases.

## Monorepo layout

```
vigour/
├── apps/
│   ├── slack-server/   Bolt JS server — intent → action → policy → audit
│   └── web/            Next.js frontend (placeholder)
├── services/
│   └── agent-worker/   Python FastAPI sidecar (placeholder)
├── packages/
│   ├── shared/         risk tiers, visual agent states, id types
│   ├── actions/        Zod-backed typed action registry (source of truth)
│   ├── policy/         risk + permission gate (allow/confirm/elevate/deny)
│   ├── audit/          audit event shape + pluggable sinks
│   ├── llm/            pluggable model providers + cost tracking + cascade
│   ├── intent/         transcript → validated SlackAction (LLM parser)
│   └── confirm/        confirmation manager: read-back, yes/no, elevated challenge, TTL
├── infra/              docker-compose (Postgres + Redis)
└── docs/               product-spec, architecture, threat-model
```

### Apps — `apps/slack-server/src/`

| File | Role |
|------|------|
| `index.ts` | Entry point — `/vigour` command handler, OAuth HTTP server, startup checks |
| `execute.ts` | Orchestrator — `executeAction()` switch, `ExecuteContext`/`ExecutionResult` types, pure JS handlers (`querySystem`, `unrecognized`) |
| `llm.ts` | `buildLlmProvider()` — resolves primary + fallback from env |
| `intent.ts` | `heuristicIntent()` — zero-cost keyword fallback when no LLM configured |
| `confirm-flow.ts` | Slack Block Kit confirmation UI (standard yes/no + elevated typed-challenge modal) |
| `env.ts` | Zod validation of `.env` vars |
| `token-store.ts` | User OAuth token persistence (`.tokens.local.json`, 3hr TTL) |
| `slack-api/index.ts` | Slack API handlers: `summarizeUnread`, `readMentions`, `draftReply`, `sendMessage`, `broadcastMessage` |
| `filesystem/index.ts` | Filesystem handlers: `readFileAction`, `listDirectory`, `searchFiles` |

### Packages

| Package | Role |
|---------|------|
| `@vigour/actions` | Action registry (9 types with risk/scopes metadata) + Zod schemas + `parseAction()` / `safeParseAction()` |
| `@vigour/intent` | `parseIntent()` — builds prompt → calls LLM → validates JSON |
| `@vigour/llm` | Provider factory, presets (`llama3.1` default), `CascadeProvider`, cost tracking |
| `@vigour/policy` | `evaluate()` — risk + scope evaluation per action type |
| `@vigour/confirm` | `ConfirmationManager` — read-back rendering, yes/no, elevated, TTL + sweep |
| `@vigour/audit` | `AuditEvent` shape + `ConsoleAuditSink` |
| `@vigour/shared` | `RiskLevel` enum, visual agent states, id types |

## Full pipeline

```
/vigour <transcript>
  → resolveIntent(transcript)
      → parseIntent(transcript, llm)    [LLM: prompt → JSON → Zod validate → SlackAction]
      → heuristicIntent(transcript)     [fallback: keyword match, zero cost]
  → evaluate(action, ctx)               [policy: risk level + scope check]
  → levelForOutcome(outcome)             [null = allow/deny, "confirm"/"elevate"]
      → allow:   executeAction(action, ctx)   → response
      → confirm: standardConfirmBlocks(pending) → await button click
      → elevate: elevatedConfirmBlocks(pending) → await typed-challenge modal
      → deny:    respond with reason
  → audit.record(event)                  [every terminal state audited]
```

`executeAction()` dispatches by action type:
- **Slack API** (5 handlers): `summarize_unread`, `read_mentions`, `draft_reply`, `send_message`, `broadcast_message` — in `slack-api/index.ts`
- **Filesystem** (3 handlers): `read_file`, `list_directory`, `search_files` — in `filesystem/index.ts`
- **Pure JS** (2 handlers): `query_system` (time/date), `unrecognized` (capabilities message) — in `execute.ts` inline

### Confirmation gating

| Risk | Outcome | Flow |
|------|---------|------|
| low | `allow` | Execute immediately |
| medium | `allow` | Execute (draft only — never sends) |
| high | `confirm` | Read-back + Confirm/Cancel buttons |
| critical | `elevate` | Typed-challenge modal (e.g. "type WX7K") |
| (blocked) | `deny` | Refuse with reason |

Pending confirmations have a 120s TTL; sweep loop expires stale ones every 30s.

## Action registry (`packages/actions/src/registry.ts`)

| Type | Risk | Confirmation | Scopes |
|------|------|-------------|--------|
| `summarize_unread` | low | no | `channels:history, groups:history` |
| `read_mentions` | low | no | `channels:history` |
| `draft_reply` | medium | no | (none) |
| `send_message` | high | yes | `chat:write` |
| `broadcast_message` | critical | yes | `chat:write` |
| `query_system` | low | no | (none) |
| `read_file` | medium | no | (none) |
| `list_directory` | low | no | (none) |
| `search_files` | low | no | (none) |
| `unrecognized` | low | no | (none) |

Adding a new action type requires: (1) a Zod schema in `schemas.ts`, (2) a `discriminatedUnion` entry, (3) an `ActionMetadata` entry in `registry.ts`, (4) an `import` + `case` arm in `execute.ts`, (5) the handler implementation in `slack-api/`, `filesystem/`, or inline.

## Development setup

### Prerequisites

- Windows 10/11
- Node 20+ and pnpm 9 (`corepack enable`)
- Python 3.11+ (only for `services/agent-worker`)
- Docker Desktop (only for Postgres/Redis via `infra/docker-compose.yml`)

### Environment variables (`apps/slack-server/.env`)

| Variable | Source |
|----------|--------|
| `SLACK_BOT_TOKEN` | Slack App Dashboard → OAuth & Permissions (`xoxb-`) |
| `SLACK_APP_TOKEN` | Slack App Dashboard → Basic Information → App-Level Tokens (`xapp-`) |
| `SLACK_SIGNING_SECRET` | Slack App Dashboard → Basic Information (32-char hex) |
| `SLACK_CLIENT_ID` | Slack App Dashboard → Basic Information |
| `SLACK_CLIENT_SECRET` | Slack App Dashboard → Basic Information |
| `PORT` | Default `3001`, used for OAuth HTTP server |

**LLM config** (also in `.env`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `VIGOUR_LLM_PROVIDER` | `ollama` | Primary provider id |
| `VIGOUR_LLM_FALLBACKS` | `deepseek` | Comma-separated fallbacks in order |
| `VIGOUR_PARSE_PROVIDER` | (unset → same as primary) | Separate model for intent parsing |
| `VIGOUR_PARSE_MODEL` | (unset → same as primary) | Model name for parse provider |

### Quickstart

```powershell
pnpm install
pnpm build
pnpm typecheck
pnpm --filter @vigour/slack-server dev    # tsx watch auto-reload
```

Server restarts are required after `.env` changes (dotenv loads once at import; `tsx watch` does NOT watch `.env`).

### Slack app manifest

Create a Slack app from `slack-app-manifest.yaml` (repo root):

1. [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From a manifest
2. Select workspace, paste the YAML, create
3. Copy **Signing Secret** → `SLACK_SIGNING_SECRET`
4. Install to workspace → copy **Bot Token** → `SLACK_BOT_TOKEN`
5. **Socket Mode** → enable, generate App-Level Token (`connections:write`) → `SLACK_APP_TOKEN`
6. **OAuth & Permissions** → copy **Client ID** → `SLACK_CLIENT_ID`, **Client Secret** → `SLACK_CLIENT_SECRET`
7. Add @Vigour to channels it should read

**Scope note:** `search:read` is a **user** scope, not a bot scope. The manifest places it under `oauth_config.scopes.user`. If you ever see a Slack API error about `search:read`, check you haven't moved it to `oauth_config.scopes.bot`. After changing app scopes, always **reinstall** the app (OAuth & Permissions → Reinstall to Workspace).

## Ollama

### Install

```powershell
# Option A — download from ollama.com/download/windows
# Option B — winget
winget install Ollama.Ollama
```

Installs to `%LOCALAPPDATA%\Programs\Ollama` and runs as a background service (system tray). About ~2 GB for the binary.

### PATH fix

If `ollama` isn't recognised in a new terminal:

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\Ollama;$env:Path"
```

Add `%LOCALAPPDATA%\Programs\Ollama` to your user PATH permanently via System Properties → Environment Variables.

### Models

```powershell
ollama pull llama3.1            # ~4.9 GB — execution model
ollama pull llama3.2:1b         # ~1.3 GB — parse model (two-model split)
```

Total storage for both: ~7 GB + Ollama binary.

### Keepalive

To keep a model pinned in RAM (avoid cold-start penalty):

```powershell
ollama run llama3.1 --keepalive 24h
```

Flag uses Go duration syntax (`24h`, `30m`, `0` to unload). The flag is `--keepalive` (one word, no hyphen). The `/bye` command or `Ctrl+D` exits the chat without unloading the model.

## Two-model parse split

- **`master` branch**: single model — `llama3.1` for both intent parsing and execution (cold start ~60s)
- **`feat/two-model-parse` branch**: split — `llama3.2:1b` (~1.3 GB) for intent parsing (~3s), `llama3.1` for execution

Controlled by two env vars (checked in `llm.ts` → `buildParseProvider()`):

```
VIGOUR_PARSE_PROVIDER=ollama
VIGOUR_PARSE_MODEL=llama3.2:1b
```

When unset, both default to `VIGOUR_LLM_PROVIDER` / `VIGOUR_OLLAMA_MODEL`.

Server logs on startup confirm which models are active:
```
Vigour mind: ollama (llama3.1)
Vigour parse mind: ollama (llama3.2:1b)
```

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `missing_scope` / `not_allowed_token_type` | Bot token lacks a required scope | Check `slack-app-manifest.yaml`, reinstall app after scope changes |
| `not_in_channel` | Bot isn't a member of the target channel | `/invite @Vigour` or run `/vigour connect` for user token |
| `ollana` / `ollama` not recognised | Ollama not on PATH | `$env:Path = "$env:LOCALAPPDATA\Programs\Ollama;$env:Path"`; add permanently to user PATH |
| `unknown flag: --keep-alive` | Hyphenated flag | Use `--keepalive` (one word) |
| Model slow / unresponsive | Cold start (model not in RAM) | `ollama run llama3.1 --keepalive 24h` to pin it |
| `Error: Cannot find module` | Packages not built | `pnpm build` or `pnpm --filter @vigour/slack-server build` |
| `.env` changes not taking effect | dotenv loads once at import | Restart the dev server |
| `search:read` errors | Scope in wrong oauth_config section | Must be under `oauth_config.scopes.user`, NOT `oauth_config.scopes.bot` |

## Build and typecheck

```powershell
pnpm build                    # turbo run build (all packages)
pnpm typecheck                # turbo run typecheck
pnpm --filter @vigour/slack-server dev   # dev server with tsx watch
```

## User OAuth

`/vigour connect` starts an OAuth flow → user token stored in `.tokens.local.json` with 3hr TTL. On restart, tokens are restored from disk. The user client is used for reads (`summarize_unread`, `read_mentions`) and writes (`send_message`, `broadcast_message`) when available; otherwise falls back to the bot token.

Token store reloads on startup from `.tokens.local.json`. Expired tokens are filtered; users reconnect via `/vigour connect`.
