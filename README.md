# Vigour

Voice-first visual Slack agent — authenticated voice commands → typed action
planning → confirmation gates → visual trace → auditable execution.

> **Platform** — This build targets **Windows** (primary dev environment).
> Mac and mobile (iOS / Android) support are planned for future releases.

This repo is the **scaffold**: the structure and the typed-action backbone are
in place; feature work follows the phases in `docs/product-spec.md`.

## Layout

```
vigour/
├── apps/
│   ├── web/            Next.js frontend (visual agent, Phase 3)
│   └── slack-server/   Bolt JS server — intent → action → policy → audit
├── services/
│   └── agent-worker/   Python FastAPI sidecar (Phase 7)
├── packages/
│   ├── shared/         risk tiers, visual agent states, id types
│   ├── actions/        zod-backed typed action registry (source of truth)
│   ├── policy/         risk + permission gate (allow/confirm/elevate/deny)
│   ├── audit/          audit event shape + pluggable sinks
│   ├── llm/            pluggable model providers + cost tracking + cascade
│   ├── intent/         transcript → validated SlackAction (the Phase 2 parser)
│   └── confirm/        confirmation manager: read-back, yes/no, elevated challenge, TTL
├── infra/              docker-compose (Postgres + Redis)
└── docs/               product-spec, architecture, threat-model
```

## Environments

This project has two environment profiles:

| Aspect              | Development (local)                                   | Production (forthcoming)          |
|---------------------|-------------------------------------------------------|-----------------------------------|
| LLM provider        | Ollama (local, no API key)                            | Hosted (e.g. Claude, GPT-4o)     |
| Slack mode          | Socket Mode (ngrok / local tunnel)                    | HTTP Events API + signing secret  |
| Database            | Docker Compose (Postgres + Redis on localhost)        | Managed cloud services            |
| Env file            | `apps/slack-server/.env`                              | Injected via CI/CD secrets        |

The sections below describe the **development** setup.

---

## Development environment

### Prerequisites

- **Windows 10/11**
- **Node 20+** and **pnpm 9** (`corepack enable`; on Windows use `nvm-windows` or `fnm` to manage Node versions)
- **Python 3.11+** (only for `services/agent-worker`)
- **Docker Desktop** (only for Postgres/Redis via `infra/docker-compose.yml`)
- **Ollama** (recommended local LLM for dev — see [Ollama setup](#recommended-model-ollama) below)

### Environment variables

The Slack server requires three tokens from a Slack app configured in **Socket Mode**:

| Variable              | Where to get it                                                                 |
|-----------------------|----------------------------------------------------------------------------------|
| `SLACK_BOT_TOKEN`     | Slack App Dashboard → **OAuth & Permissions** — starts with `xoxb-`              |
| `SLACK_APP_TOKEN`     | Slack App Dashboard → **Basic Information** → **App-Level Tokens** — starts with `xapp-` |
| `SLACK_SIGNING_SECRET`| Slack App Dashboard → **Basic Information** — 32‑character hex string             |

Create a Slack app from `slack-app-manifest.yaml` at the repo root, then copy the tokens into:

```
apps/slack-server/.env
```

A pre-filled example is at `apps/slack-server/.env.example` — copy it and fill in your values:

```powershell
Copy-Item apps/slack-server/.env.example apps/slack-server/.env
```

Then open `.env` and replace the placeholder values (`xoxb-...`, `xapp-...`, `...`) with your real tokens.

### Quickstart

```powershell
# 1. Install dependencies
pnpm install

# 2. Build the TS packages
pnpm build

# 3. Type-check everything
pnpm typecheck

# 4. Infra (optional — needed for Postgres/Redis features)
docker compose -f infra/docker-compose.yml up -d

# 5. Slack server (Phase 1) — uses the .env you configured above
pnpm --filter @vigour/slack-server dev

# 6. Web placeholder
pnpm --filter @vigour/web dev

# 7. Python worker
cd services/agent-worker
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

> PowerShell is the default shell on Windows. All commands above use PowerShell syntax.
> If you prefer `cmd.exe`, replace `Copy-Item` with `copy` and use `%CD%` for the current directory.

### MCP server

Vigour exposes all Slack actions as [MCP (Model Context Protocol)](https://modelcontextprotocol.io) tools on port **3002**:

| Tool | Description |
|------|-------------|
| `summarize_unread` | Summarize recent messages in a channel |
| `read_mentions` | Read messages mentioning the user |
| `draft_reply` | Draft a reply to a thread |
| `send_message` | Send a message to a channel |
| `broadcast_message` | Broadcast to multiple channels |
| `query_system` | Query system info (time/date) |
| `read_file` | Read a file from the filesystem |
| `list_directory` | List directory contents |
| `search_files` | Search for files by pattern |

Connect any MCP host (Claude Desktop, Cursor, etc.) to `http://localhost:3002` to use Vigour's Slack capabilities.

### Recommended model: Ollama (local, free)

Ollama runs the LLM entirely on your machine — zero cost, no API key, no data
leaving your PC. It's the recommended provider for local development.

**Storage:** The Ollama binary itself is ~1.8–2 GB (installer or `winget`). Pulling
the recommended `llama3.1` model adds ~4.9 GB on top, so budget roughly **7 GB**
total for the full dev LLM stack.

#### Install on Windows

1. Download the installer from [ollama.com/download/windows](https://ollama.com/download/windows)
2. Run `OllamaSetup.exe` — it installs to `%LOCALAPPDATA%\Programs\Ollama`
3. Ollama runs as a background service (system tray). Verify it's running:
   ```powershell
   ollama --version
   ```
4. Pull the recommended model for Vigour:
   ```powershell
   ollama pull llama3.1
   ```
5. Confirm the model responds:
   ```powershell
   ollama run llama3.1 "Hello"
   ```
   (use `Ctrl+D` or `/bye` to exit the chat)

#### Wire it up

The `.env` is already pre-configured for Ollama (set as `VIGOUR_LLM_PROVIDER`).
Just make sure `ollama serve` is running (it starts automatically on login) and
start the slack server. The model name defaults to `llama3.1` — to use a
different one, uncomment and set `VIGOUR_OLLAMA_MODEL` in `.env`.

> **Tip:** You can install Ollama via `winget` as well:
> ```powershell
> winget install Ollama.Ollama
> ```

## Choosing the model behind Vigour (cost control)

The "mind" is pluggable. Set two env vars:

```powershell
# In apps/slack-server/.env:
VIGOUR_LLM_PROVIDER=ollama      # primary
VIGOUR_LLM_FALLBACKS=deepseek   # optional, tried in order if primary fails
```

Supported provider ids: `ollama` (local, $0), `deepseek`, `kimi`, `openrouter`,
`groq`, `openai`, `claude`. The first six (except OpenAI/Claude) are OpenAI-API
compatible and share one adapter; switching is just a base URL + model + key.

To minimise spend, put a **free/local** provider first and a paid one last —
you only pay when the cheap option is unavailable. Every parse records its
provider, model, token usage, and estimated USD cost into the audit log, so
spend is observable. Rough cost to parse one command (≈140 tokens):

| Provider / model            | est. cost per parse |
| --------------------------- | ------------------- |
| Ollama (local)              | $0                  |
| DeepSeek v4-flash           | ~$0.00002           |
| Claude Haiku 4.5            | ~$0.0002            |

Prices live in `packages/llm/cost.ts` (verify before trusting them). Unknown
models record token counts with a `null` cost rather than guessing.

## Production environment

Production configuration documentation is forthcoming. Key differences from the
development setup above:

- **Hosted LLM provider** — Claude or GPT-4o with API key management (no Ollama)
- **Slack HTTP Events API** — public endpoint with signing secret verification (not Socket Mode)
- **Managed Postgres/Redis** — cloud database services (not Docker local)
- **CI/CD-injected env vars** — no `.env` file; secrets injected by the deployment platform

---

## The core contract

The LLM never calls Slack directly. It proposes a structured action; everything
after schema validation is deterministic and auditable:

```
transcript → intent (LLM) → parseAction() [zod] → evaluate() [policy]
           → confirmation? → Slack API → AuditEvent → visual trace + speech
```

The parser validates the model's JSON against the Zod schema and, on a bad
reply, feeds the schema error back for one retry before giving up. See
`docs/architecture.md`.

## Confirmation gating (Phase 5)

Write actions can't run without approval. The policy outcome maps to a
confirmation level, and the (transport-agnostic) `ConfirmationManager` drives
the flow — Slack today, voice/visual later:

| Action risk | Policy outcome | Flow                                        |
| ----------- | -------------- | ------------------------------------------- |
| low         | `allow`        | execute immediately                         |
| medium      | `allow`        | execute (draft only — never sends)          |
| high        | `confirm`      | **read-back + Confirm/Cancel buttons**      |
| critical    | `elevate`      | **typed-challenge modal** (e.g. "type WX7K") |
| (blocked)   | `deny`         | refuse with reason                          |

Every pending confirmation has a TTL; a sweep loop expires stale ones and
audits them as `timed_out`. Approve / reject / expire each write one terminal
audit event carrying the LLM provenance and cost from the parse step. Critical
actions are flat-denied unless the session is cleared for elevation (a
per-workspace kill-switch), so escalation can be turned off entirely.

## Status

- ✅ Monorepo structure, tooling (pnpm + turbo + TS project configs)
- ✅ Typed action registry, risk/permission policy engine, audit types + sinks
- ✅ Pluggable multi-provider LLM layer (local/free + paid), cost tracking, cascade fallback
- ✅ Phase 2 intent parser: transcript → validated `SlackAction`, with retry + spend auditing
- ✅ **Phase 5 confirmations**: read-back, yes/no buttons, elevated typed-challenge modal, TTL + sweep
- ✅ Bolt `/vigour` command running the full gated pipeline (heuristic fallback when no provider set)
- ⛏️ Phase 3 (visual trace), Phase 4 (voice loop), Phase 6 (auth), real Slack reads/writes
  — follow the phases in `docs/product-spec.md`

> Open question flagged in the threat model: Slack has no clean "my unread
> messages" endpoint. Resolve the exact mechanism (user token + read-state)
> before committing to "summarize my unread Slack" as the first demo.
