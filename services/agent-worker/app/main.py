"""Vigour agent worker (Phase 7 stub).

Long-running tasks that don't belong in the Slack request/response loop:
RAG, thread/document summarization, embeddings, evals, vision experiments.
"""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Vigour Agent Worker", version="0.1.0")


class ResearchRequest(BaseModel):
    session_id: str
    query: str
    channel_id: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/research")
def research(req: ResearchRequest) -> dict[str, str]:
    # TODO (Phase 7): enqueue long-running research; stream results to frontend.
    return {
        "session_id": req.session_id,
        "status": "queued",
        "detail": "Research worker is a Phase 7 stub.",
    }
