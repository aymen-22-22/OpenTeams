"""The single wrapper around LiteLLM. Everything that calls a model goes through `LLM`."""

from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from typing import Any

from app.ai.models import Length, Provider
from app.core.settings import get_settings

MAX_TOKENS = {Length.SHORT: 300, Length.MEDIUM: 800, Length.LONG: 2000}


@dataclass(frozen=True)
class ModelRequest:
    provider: Provider
    model: str
    api_key: str | None
    messages: list[dict[str, str]]
    max_tokens: int


@dataclass(frozen=True)
class Completion:
    text: str
    tokens_in: int
    tokens_out: int
    cost: float


LLM = Callable[[ModelRequest], Coroutine[Any, Any, Completion]]


def _route(provider: Provider, model: str) -> tuple[str, str | None]:
    """LiteLLM model name and API base. Bases come from server settings, never from users."""
    s = get_settings()
    match provider:
        case Provider.ANTHROPIC:
            return f"anthropic/{model}", None
        case Provider.OPENAI:
            return f"openai/{model}", None
        case Provider.QWEN:
            return f"openai/{model}", s.qwen_url  # OpenAI-compatible endpoint
        case Provider.OLLAMA:
            return f"ollama_chat/{model}", s.ollama_url


async def litellm_complete(req: ModelRequest) -> Completion:
    import litellm  # imported lazily: heavy, and unused in tests

    name, api_base = _route(req.provider, req.model)
    response = await litellm.acompletion(
        model=name,
        messages=req.messages,
        api_key=req.api_key,
        api_base=api_base,
        max_tokens=req.max_tokens,
        timeout=get_settings().ai_timeout_seconds,
        num_retries=2,
    )
    usage = getattr(response, "usage", None)
    try:
        cost = float(litellm.completion_cost(completion_response=response))
    except Exception:  # unknown price (e.g. local models)
        cost = 0.0
    return Completion(
        text=response.choices[0].message.content or "",
        tokens_in=getattr(usage, "prompt_tokens", 0) or 0,
        tokens_out=getattr(usage, "completion_tokens", 0) or 0,
        cost=cost,
    )


def get_llm() -> LLM:
    """FastAPI dependency; tests override it with a fake provider."""
    return litellm_complete
