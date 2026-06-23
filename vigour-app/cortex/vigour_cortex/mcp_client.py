"""MCP HTTP client to invoke vigour-core tools."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class McpClient:
    """Speaks MCP JSON-RPC over HTTP to vigour-core on :3002."""

    def __init__(self, url: str) -> None:
        self._url = url
        self._req_id = 0
        self._http = httpx.AsyncClient(timeout=30)

    async def close(self) -> None:
        await self._http.aclose()

    async def _request(self, method: str, params: Any = None) -> Any:
        self._req_id += 1
        body = {"jsonrpc": "2.0", "id": self._req_id, "method": method}
        if params is not None:
            body["params"] = params
        res = await self._http.post(self._url, json=body)
        res.raise_for_status()
        data = res.json()
        if "error" in data:
            raise RuntimeError(f"MCP error: {data['error']}")
        return data["result"]

    async def list_tools(self) -> list[str]:
        result = await self._request("tools/list")
        return [t["name"] for t in result["tools"]]

    async def call_tool(self, name: str, args: dict[str, Any]) -> str:
        result = await self._request("tools/call", {"name": name, "arguments": args})
        texts = [c["text"] for c in result["content"] if c["type"] == "text"]
        return "\n".join(texts)

    async def parse_intent(self, text: str) -> str:
        """Ask vigour-core to parse a natural-language intent and execute it."""
        return await self.call_tool("unrecognized", {"originalQuery": text})
