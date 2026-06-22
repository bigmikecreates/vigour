"""Speech-to-text using faster-whisper."""

from __future__ import annotations

import logging

import numpy as np

from vigour_cortex.config import Config

logger = logging.getLogger(__name__)


class SpeechRecognizer:
    """Transcribes audio samples to text using faster-whisper."""

    def __init__(self, config: Config) -> None:
        self._config = config
        self._model = None

    def _load_model(self):
        from faster_whisper import WhisperModel

        logger.info(
            "Loading whisper model '%s' on %s...",
            self._config.whisper_model,
            self._config.whisper_device,
        )
        self._model = WhisperModel(
            self._config.whisper_model,
            device=self._config.whisper_device,
            compute_type=self._config.whisper_compute_type,
        )

    @property
    def model(self):
        if self._model is None:
            self._load_model()
        return self._model

    def transcribe(self, samples: np.ndarray, sample_rate: int) -> str:
        """Run ASR, return the transcribed text."""
        segments, info = self.model.transcribe(
            samples.astype(np.float32) / 32768.0,
            beam_size=5,
            language="en",
            vad_filter=True,
        )
        text = " ".join(seg.text for seg in segments)
        logger.info("ASR: %s", text.strip())
        return text.strip()
