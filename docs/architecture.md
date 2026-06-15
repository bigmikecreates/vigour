# Architecture

```
React/Next.js frontend (apps/web)
        |  WebSocket/SSE (Phase 3)
TypeScript Bolt server (apps/slack-server)
        |
Action registry + policy engine (packages/actions, packages/policy)
        |
Queue / job dispatcher (Redis, later)
        |
Python agent worker (services/agent-worker, Phase 7)
        |
Slack API  +  visual agent updates
```

## Request pipeline (the core contract)

```
voice/text -> transcript
           -> intent parser (LLM)        emits candidate action JSON
           -> schema validation          parseAction(): zod (packages/actions)
           -> policy + permission check  evaluate() (packages/policy)
           -> confirmation (if needed)
           -> Slack API execution
           -> audit event recorded       (packages/audit)
           -> visual trace + spoken reply
```

The LLM never calls Slack directly. It only proposes a structured action;
everything after `schema validation` is deterministic and auditable.

## Packages

- `@vigour/shared`  — risk tiers, visual agent states, id aliases
- `@vigour/actions` — zod-backed typed action registry (source of truth)
- `@vigour/policy`  — risk + permission gate -> allow/confirm/elevate/deny
- `@vigour/audit`   — audit event shape + pluggable sinks
- `@vigour/llm`     — provider-agnostic model layer (one `LlmProvider`
  interface; OpenAI-compatible adapter for OpenAI/DeepSeek/Kimi/Ollama/
  OpenRouter/Groq + an Anthropic adapter), cost estimation, and a
  `CascadeProvider` that falls through cheap→paid on failure
- `@vigour/intent`  — the intent parser: prompt built from the action
  registry, model output validated by zod, one retry on schema error,
  token/cost reported back for auditing
- `@vigour/confirm` — transport-agnostic confirmation lifecycle: read-back
  rendering, policy-outcome→level mapping, standard (yes/no) vs elevated
  (typed challenge) confirmations, TTL/expiry, pluggable store

## Why a provider abstraction

The intent parser depends only on the `LlmProvider` interface, never on a
specific vendor. That keeps the agent's "mind" swappable — run a free local
model (Ollama) for everyday parsing, cascade to a cheap hosted model
(DeepSeek/Kimi) when local is down, and reserve paid models (Claude/OpenAI)
for last resort. Cost is recorded per call so spend is visible in the audit log.
