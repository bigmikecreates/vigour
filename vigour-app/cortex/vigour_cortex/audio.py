"""Audio input/output with VAD-based utterance detection."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import sounddevice as sd

from vigour_cortex.config import Config

logger = logging.getLogger(__name__)


@dataclass
class Utterance:
    samples: np.ndarray
    sample_rate: int


class AudioInput:
    """Captures microphone audio and detects utterance boundaries using VAD."""

    def __init__(self, config: Config) -> None:
        self._config = config
        self._vad = None

    @property
    def vad(self):
        if self._vad is None:
            import webrtcvad

            self._vad = webrtcvad.Vad(2)
        return self._vad

    def listen_for_utterance(
        self, timeout_sec: float = 10.0
    ) -> Utterance | None:
        """Blocks until speech is detected, then captures until silence.

        Returns the audio samples or ``None`` on timeout.
        """
        sr = self._config.sample_rate
        chunk = self._config.chunk_samples
        silence_limit = self._config.silence_samples

        buffer: list[np.ndarray] = []
        speech_frames = 0
        silence_frames = 0
        started = False
        total_silent = 0

        logger.info("Listening...")

        with sd.InputStream(
            samplerate=sr,
            channels=1,
            dtype="int16",
            blocksize=chunk,
        ) as stream:
            while True:
                block, _ = stream.read(chunk)
                is_speech = self._vad.is_speech(
                    block.tobytes(), sr
                )

                if is_speech:
                    silence_frames = 0
                    if not started:
                        started = True
                        logger.debug("Speech started")
                    speech_frames += 1
                    buffer.append(block.copy())
                else:
                    if started:
                        silence_frames += 1
                        buffer.append(block.copy())
                        if silence_frames * chunk >= silence_limit:
                            break
                    else:
                        total_silent += 1
                        if total_silent * chunk >= sr * timeout_sec:
                            logger.info("Listen timeout")
                            return None

        if not buffer:
            return None

        samples = np.concatenate(buffer)
        logger.info(
            "Captured %.1f sec of audio", len(samples) / sr
        )
        return Utterance(samples=samples, sample_rate=sr)


class AudioOutput:
    """Plays audio through the default output device."""

    def __init__(self, config: Config) -> None:
        self._config = config

    def play(self, samples: np.ndarray, sample_rate: int) -> None:
        sd.play(samples, samplerate=sample_rate)
        sd.wait()

    def play_wav(self, path: Path) -> None:
        import soundfile as sf

        data, sr = sf.read(str(path))
        self.play(data, int(sr))
