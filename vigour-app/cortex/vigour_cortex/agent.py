"""Main voice agent loop: wake → listen → ASR → MCP → speak."""

from __future__ import annotations

import asyncio
import logging

from vigour_cortex.asr import SpeechRecognizer
from vigour_cortex.audio import AudioInput, AudioOutput
from vigour_cortex.config import Config
from vigour_cortex.mcp_client import McpClient
from vigour_cortex.tts import TextToSpeech
from vigour_cortex.wake_word import WakeWordDetector
from vigour_cortex.ws_client import OverlayClient

logger = logging.getLogger(__name__)


class VoiceAgent:
    """Orchestrates the wake → listen → transcribe → execute → speak pipeline."""

    def __init__(self, config: Config) -> None:
        self._config = config
        self._audio_in = AudioInput(config)
        self._audio_out = AudioOutput(config)
        self._wake = WakeWordDetector(config)
        self._asr = SpeechRecognizer(config)
        self._tts = TextToSpeech(config, self._audio_out)
        self._mcp = McpClient(config.mcp_url)
        self._overlay = OverlayClient(config.ws_url)
        self._connect_task: asyncio.Task | None = None

    async def _notify(self, state: str, msg: str = "") -> None:
        await self._overlay.send_state(state, msg)

    async def run(self) -> None:
        """Main loop: detect wake word, transcribe, execute, respond."""
        self._connect_task = asyncio.create_task(self._overlay.connect())
        await self._notify("idle", "Vigour ready")

        while True:
            # 1. Wait for wake word
            await self._notify("idle", "Waiting for wake word")
            await asyncio.to_thread(self._wake.wait_for_wake_word)

            # 2. Listen for utterance
            await self._notify("listening", "Listening...")
            utterance = await asyncio.to_thread(self._audio_in.listen_for_utterance)
            if utterance is None:
                continue
            await self._overlay.send_transcript("")

            # 3. Transcribe
            await self._notify("thinking", "Transcribing...")
            text = await asyncio.to_thread(self._asr.transcribe, utterance.samples, utterance.sample_rate)
            if not text:
                await self._notify("error", "No speech detected")
                continue
            await self._overlay.send_transcript(text)

            # 4. Execute via MCP
            await self._notify("executing", text)
            try:
                result = await self._mcp.parse_intent(text)
            except Exception as e:
                logger.exception("MCP call failed")
                result = f"Sorry, I couldn't process that: {e}"

            # 5. Speak response
            await self._notify("speaking", result[:120])
            await asyncio.to_thread(self._tts.speak, result)

            await self._notify("complete", "")

    async def shutdown(self) -> None:
        if self._connect_task:
            self._connect_task.cancel()
        self._wake.close()
        await self._mcp.close()
