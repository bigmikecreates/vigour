"""Text-to-speech using Piper."""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from vigour_cortex.audio import AudioOutput
from vigour_cortex.config import Config

logger = logging.getLogger(__name__)


class TextToSpeech:
    """Synthesises speech from text using Piper TTS."""

    def __init__(self, config: Config, audio_output: AudioOutput) -> None:
        self._config = config
        self._audio_output = audio_output
        self._piper = None

    def _load_piper(self):
        from piper import PiperVoice

        model_path = self._resolve_model_path()
        logger.info("Loading Piper model '%s'...", model_path)
        self._piper = PiperVoice.load(str(model_path), use_cuda=False)

    def _resolve_model_path(self) -> Path:
        model = self._config.piper_model
        # If it's already a path, use it
        p = Path(model)
        if p.exists():
            return p
        # Check models dir
        local = Path(__file__).parent.parent / "models" / model
        if local.exists():
            return local
        # Piper will download if not found
        return p

    @property
    def piper(self):
        if self._piper is None:
            self._load_piper()
        return self._piper

    def speak(self, text: str) -> None:
        """Synthesise and play text through speakers."""
        logger.info("TTS: %s", text)
        chunks = list(self.piper.synthesize(text))
        if not chunks:
            return
        audio = np.concatenate([c.audio_int16_array for c in chunks])
        self._audio_output.play(audio, chunks[0].sample_rate)
