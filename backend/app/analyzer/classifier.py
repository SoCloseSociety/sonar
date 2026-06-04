import json
import logging
import httpx
from pathlib import Path
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

PROMPTS_DIR = Path(__file__).parent / "prompts"


class OllamaClassifier:
    """Classifies events using local Ollama LLM."""

    def __init__(self):
        self.base_url = settings.ollama_base_url
        self.model = settings.ollama_model

    async def classify(self, text: str, source: str, credibility: float, timestamp: str) -> dict | None:
        prompt_template = (PROMPTS_DIR / "classify.txt").read_text()
        prompt = prompt_template.format(
            text=text, source=source, credibility=credibility, timestamp=timestamp,
        )
        return await self._call_ollama(prompt)

    async def score_impact(self, text: str, category: str, credibility: float, corroboration: int) -> dict | None:
        prompt_template = (PROMPTS_DIR / "score_impact.txt").read_text()
        prompt = prompt_template.format(
            text=text, category=category, credibility=credibility, corroboration=corroboration,
        )
        return await self._call_ollama(prompt)

    async def correlate_markets(self, text: str, category: str, severity: int, markets: str) -> list[dict]:
        prompt_template = (PROMPTS_DIR / "correlate.txt").read_text()
        prompt = prompt_template.format(
            text=text, category=category, severity=severity, markets=markets,
        )
        result = await self._call_ollama(prompt)
        if isinstance(result, list):
            return result
        return []

    async def summarize(self, text: str, source: str) -> str:
        prompt_template = (PROMPTS_DIR / "summarize.txt").read_text()
        prompt = prompt_template.format(text=text, source=source)
        result = await self._call_ollama_text(prompt)
        return result or text[:200]

    async def _call_ollama(self, prompt: str) -> dict | list | None:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "format": "json",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                response_text = data.get("response", "")
                if not response_text or not response_text.strip():
                    logger.warning("Ollama returned empty response")
                    return None
                parsed = json.loads(response_text)
                # Ensure we got a dict or list, not a string
                if isinstance(parsed, (dict, list)):
                    return parsed
                logger.warning(f"Ollama returned unexpected type: {type(parsed)}")
                return None
        except json.JSONDecodeError as e:
            logger.warning(f"Ollama returned invalid JSON: {e}")
            return None
        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama HTTP error {e.response.status_code}: model={self.model} may not exist")
            return None
        except Exception as e:
            logger.error(f"Ollama call failed: {e}")
            return None

    async def _call_ollama_text(self, prompt: str) -> str | None:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                return data.get("response", "").strip()
        except Exception as e:
            logger.error(f"Ollama text call failed: {e}")
            return None

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False
