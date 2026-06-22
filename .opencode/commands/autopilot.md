---
description: Execute all Vigour phases (19→20→23→21→24→22) in order.
---

Execute vigour GitHub issues #19 (Phase 0 MCP), then #20 (Phase 1 Tauri),
then #23 (Phase 2 Cortex), then #21 (Phase 3 Avatar), then #24 (Phase 4 Auth),
then #22 (Phase 5 Polish) sequentially. For each issue, read its full body,
read the existing codebase, implement the acceptance criteria, verify with
`pnpm build && pnpm typecheck` (or `cargo build` / python tests where
appropriate), commit with a message referencing the issue number, and mark
checkboxes as done. Stop and ask if anything is unclear or blocked.
