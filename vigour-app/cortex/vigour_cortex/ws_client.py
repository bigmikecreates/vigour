"""WebSocket client to push state and receive commands from the overlay."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Callable

logger = logging.getLogger(__name__)


class OverlayClient:
    """Connects to the Vigour overlay WebSocket server on :9000."""

    def __init__(self, url: str) -> None:
        self._url = url
        self._ws: asyncio.Task | None = None
        self._callbacks: list[Callable[[dict], None]] = []

    def on_message(self, cb: Callable[[dict], None]) -> None:
        self._callbacks.append(cb)

    async def connect(self) -> None:
        import websockets

        while True:
            try:
                async with websockets.connect(self._url) as ws:
                    logger.info("Connected to overlay at %s", self._url)
                    async for raw in ws:
                        for cb in self._callbacks:
                            try:
                                msg = json.loads(raw)
                                cb(msg)
                            except Exception:
                                logger.exception("callback error")
                logger.warning("Disconnected, reconnecting...")
            except ConnectionRefusedError:
                logger.info("Overlay not ready yet, retrying...")
            except Exception:
                logger.exception("WebSocket error")
            await asyncio.sleep(2)

    async def send_state(self, state: str, message: str = "") -> None:
        """Push a state_change event to the overlay."""
        payload = json.dumps(
            {"type": "state_change", "payload": {"state": state, "message": message}}
        )
        import websockets

        try:
            async with websockets.connect(self._url) as ws:
                await ws.send(payload)
        except Exception:
            pass  # best effort

    async def send_transcript(self, text: str) -> None:
        payload = json.dumps(
            {"type": "transcript", "payload": {"text": text}}
        )
        import websockets

        try:
            async with websockets.connect(self._url) as ws:
                await ws.send(payload)
        except Exception:
            pass
