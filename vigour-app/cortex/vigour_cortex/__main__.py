"""Entry point when run as ``python -m vigour_cortex``."""

from __future__ import annotations

import asyncio
import logging
import sys

from vigour_cortex.agent import VoiceAgent
from vigour_cortex.config import Config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)

logger = logging.getLogger("vigour_cortex")


async def _main() -> None:
    config = Config()
    agent = VoiceAgent(config)

    try:
        await agent.run()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        await agent.shutdown()


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
