"""Wake-word detection using Porcupine."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterator

import numpy as np
import pvporcupine
import sounddevice as sd

from vigour_cortex.config import Config

logger = logging.getLogger(__name__)


class WakeWordDetector:
    """Listens for a wake word and yields audio chunks for utterance capture."""

    def __init__(self, config: Config) -> None:
        self._config = config
        self._porcupine: pvporcupine.Porcupine | None = None

    def _init_porcupine(self) -> pvporcupine.Porcupine:
        kw = self._config.porcupine_keyword
        # Porcupine supports keyword_paths for custom .ppn files or built-in keywords
        if kw.endswith(".ppn"):
            return pvporcupine.create(
                access_key=self._config.porcupine_key,
                keyword_paths=[kw],
                sensitivities=[self._config.porcupine_sensitivity],
            )
        else:
            return pvporcupine.create(
                access_key=self._config.porcupine_key,
                keywords=[kw],
                sensitivities=[self._config.porcupine_sensitivity],
            )

    @property
    def porcupine(self) -> pvporcupine.Porcupine:
        if self._porcupine is None:
            self._porcupine = self._init_porcupine()
        return self._porcupine

    def wait_for_wake_word(self) -> bool:
        """Blocks until the wake word is detected. Returns True on detection.

        Runs audio capture in a tight loop, checking each frame against Porcupine.
        """
        porcupine = self.porcupine
        sr = self._config.sample_rate
        frame_length = porcupine.frame_length

        logger.info(
            "Waiting for wake word '%s'...",
            self._config.porcupine_keyword,
        )

        with sd.InputStream(
            samplerate=sr,
            channels=1,
            dtype="int16",
            blocksize=frame_length,
        ) as stream:
            while True:
                block, _ = stream.read(frame_length)
                result = porcupine.process(block)
                if result >= 0:
                    logger.info("Wake word detected!")
                    return True

    def close(self) -> None:
        if self._porcupine is not None:
            self._porcupine.delete()
            self._porcupine = None
