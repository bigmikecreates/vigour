# agent-worker

Python (FastAPI) sidecar for long-running tasks (Phase 7). Kept out of the
TypeScript pnpm workspace on purpose.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
