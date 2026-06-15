# Threat Model (working notes)

## Assets
- Slack tokens (bot + user OAuth grants)
- Audit log (who asked Vigour to do what)
- Biometric data, if/when face/voice auth is added

## Key risks
1. **Prompt injection -> unintended Slack actions.** Mitigation: the LLM only
   proposes typed actions; schema validation + the policy engine gate every
   write. Read-only by default; sends require confirmation.
2. **Over-broad Slack scopes.** Request the minimum scopes per action
   (declared in the action registry). Avoid blanket `chat:write` until needed.
3. **Confused-deputy / acting as the wrong user.** Bind every action to a
   session + user id; log it. Note that reading a user's own unread/mentions
   needs *user* tokens, not just a bot token (see open question below).
4. **Biometric auth (Phase 6).** Storing/processing face + voice data carries
   privacy and legal weight. Strongly consider deferring or scoping to
   voice-only, and never store raw biometrics.

## Open question to resolve before Phase 1 demo
Slack does not expose a clean "my unread messages" endpoint. Confirm the exact
mechanism (user token + read-state tracking) before committing to
"summarize my unread Slack" as the first demo.
