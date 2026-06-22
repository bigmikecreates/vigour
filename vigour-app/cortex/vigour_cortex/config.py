"""Configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class Config:
    # Wake word
    porcupine_key: str = field(
        default_factory=lambda: os.environ.get("VIGOUR_PORCUPINE_KEY", "")
    )
    porcupine_keyword: str = field(
        default_factory=lambda: os.environ.get("VIGOUR_WAKE_WORD", "computer")
    )
    porcupine_sensitivity: float = float(os.environ.get("VIGOUR_SENSITIVITY", "0.5"))

    # ASR
    whisper_model: str = field(
        default_factory=lambda: os.environ.get("VIGOUR_WHISPER_MODEL", "base")
    )
    whisper_device: str = field(
        default_factory=lambda: os.environ.get("VIGOUR_WHISPER_DEVICE", "cpu")
    )
    whisper_compute_type: str = field(
        default_factory=lambda: os.environ.get(
            "VIGOUR_WHISPER_COMPUTE", "int8_float32"
        )
    )

    # TTS
    piper_model: str = field(
        default_factory=lambda: os.environ.get(
            "VIGOUR_PIPER_MODEL", "en_US-lessac-medium"
        )
    )
    piper_rate: float = float(os.environ.get("VIGOUR_PIPER_RATE", "1.0"))

    # Audio
    sample_rate: int = int(os.environ.get("VIGOUR_SAMPLE_RATE", "16000"))
    chunk_duration_ms: int = int(os.environ.get("VIGOUR_CHUNK_MS", "30"))
    silence_duration_ms: int = int(
        os.environ.get("VIGOUR_SILENCE_MS", "500")
    )

    # IPC
    mcp_url: str = field(
        default_factory=lambda: os.environ.get(
            "VIGOUR_MCP_URL", "http://localhost:3002"
        )
    )
    ws_url: str = field(
        default_factory=lambda: os.environ.get(
            "VIGOUR_WS_URL", "ws://127.0.0.1:9000"
        )
    )

    # Auth (future)
    auth_enabled: bool = (
        os.environ.get("VIGOUR_AUTH_ENABLED", "false").lower() == "true"
    )

    @property
    def chunk_samples(self) -> int:
        return int(self.sample_rate * self.chunk_duration_ms / 1000)

    @property
    def silence_samples(self) -> int:
        return int(self.sample_rate * self.silence_duration_ms / 1000)
