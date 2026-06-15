# Vigour

Voice-first visual Slack agent — authenticated voice commands → typed action
planning → confirmation gates → visual trace → auditable execution.

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

## Prerequisites

- Node 20+ and pnpm 9 (`corepack enable`)
- Python 3.11+ (only for `services/agent-worker`)
- Docker (only for Postgres/Redis via `infra/docker-compose.yml`)

## Quickstart

```bash
pnpm install
pnpm build          # builds the TS packages
pnpm typecheck      # type-checks everything

# infra (optional until you wire Postgres/Redis)
docker compose -f infra/docker-compose.yml up -d

# slack-server (Phase 1) — needs a Slack app + Socket Mode tokens
cp apps/slack-server/.env.example apps/slack-server/.env   # fill in tokens
pnpm --filter @vigour/slack-server dev

# web placeholder
pnpm --filter @vigour/web dev

# python worker
cd services/agent-worker && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Choosing the model behind Vigour (cost control)

The "mind" is pluggable. Set two env vars:

```bash
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
