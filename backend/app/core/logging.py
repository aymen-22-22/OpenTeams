import json
import logging
from datetime import UTC, datetime


class JsonFormatter(logging.Formatter):
    """One JSON object per line. Never log personal content or secrets."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def setup_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=level, handlers=[handler], force=True)
    # These libraries log full URLs (outbound calls, raw paths with tokens): keep them quiet.
    # APScheduler logs every job run (every few seconds); failures still show as warnings/errors.
    for noisy in ("httpx", "httpcore", "uvicorn.access", "LiteLLM", "apscheduler"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
