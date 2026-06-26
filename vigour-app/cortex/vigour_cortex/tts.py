"""Text-to-speech using Kokoro TTS."""

from __future__ import annotations

import logging

import numpy as np

from vigour_cortex.audio import AudioOutput
from vigour_cortex.config import Config

logger = logging.getLogger(__name__)

KOKORO_SAMPLE_RATE = 24_000


class TextToSpeech:
    """Synthesises speech from text using Kokoro TTS."""

    def __init__(self, config: Config, audio_output: AudioOutput) -> None:
        self._config = config
        self._audio_output = audio_output
        self._pipeline = None

    @property
    def pipeline(self):
        if self._pipeline is None:
            from kokoro import KPipeline
            # British voices (bm_*, bf_*) need lang_code="b"; all others are American ("a")
            lang_code = "b" if self._config.kokoro_voice[:3] in ("bm_", "bf_") else "a"
            logger.info("Loading Kokoro TTS pipeline (voice=%s, lang=%s)...", self._config.kokoro_voice, lang_code)
            self._pipeline = KPipeline(lang_code=lang_code)
        return self._pipeline

    def speak(self, text: str) -> None:
        """Synthesise and play text through speakers."""
        logger.info("TTS: %s", text)
        chunks = [
            audio
            for _, _, audio in self.pipeline(
                text,
                voice=self._config.kokoro_voice,
                speed=self._config.kokoro_speed,
            )
        ]
        if not chunks:
            return
        self._audio_output.play(np.concatenate(chunks), KOKORO_SAMPLE_RATE)
