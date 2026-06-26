"""Wake-word detection using OpenWakeWord."""

from __future__ import annotations

import logging

import sounddevice as sd
from openwakeword.model import Model

from vigour_cortex.config import Config

logger = logging.getLogger(__name__)

# OpenWakeWord is trained at 16 kHz; both constants are coupled to this rate.
_OWW_SAMPLE_RATE = 16_000
FRAME_LENGTH = 1280  # 80 ms at 16 kHz


class WakeWordDetector:
    """Listens for a wake word and returns True on detection."""

    def __init__(self, config: Config) -> None:
        self._config = config
        self._model: Model | None = None

    @property
    def model(self) -> Model:
        if self._model is None:
            self._model = Model(wakeword_models=[self._config.wake_word_model])
        return self._model

    def wait_for_wake_word(self) -> bool:
        """Blocks until the wake word is detected. Returns True on detection."""
        model = self.model
        threshold = self._config.wake_word_threshold

        logger.info(
            "Waiting for wake word (model=%s, threshold=%.2f)...",
            self._config.wake_word_model,
            threshold,
        )

        with sd.InputStream(
            samplerate=_OWW_SAMPLE_RATE,
            channels=1,
            dtype="int16",
            blocksize=FRAME_LENGTH,
        ) as stream:
            while True:
                block, _ = stream.read(FRAME_LENGTH)
                scores = model.predict(block.flatten())
                if any(v >= threshold for v in scores.values()):
                    logger.info("Wake word detected!")
                    model.reset()
                    return True

    def close(self) -> None:
        self._model = None
