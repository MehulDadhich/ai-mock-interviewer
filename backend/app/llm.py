"""All AI calls, on Groq: the interviewer, the debrief, and Whisper speech-to-text.

Groq's API is OpenAI-compatible, so plain httpx is enough (no extra SDK).
"""

import asyncio
import json
import logging
import time

import httpx

from .config import settings
from .schemas import REPORT_SCHEMA, TURN_SCHEMA

BASE = "https://api.groq.com/openai/v1"
log = logging.getLogger("rehearse.llm")

# Rate limits (429) and hiccups (5xx) are usually gone within seconds, so wait and retry.
RETRY_CODES = {429, 500, 502, 503}
TURN_WAITS = (1, 3, 6)
TRANSCRIBE_WAITS = (1, 3)
MAX_HINTED_WAIT = 12  # if Groq asks for a longer wait than this, give up and say so

_http = httpx.AsyncClient(base_url=BASE)


class GroqError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(f"Groq {status}: {message}")
        self.status = status
        self.message = message


def is_daily_limit(e: GroqError) -> bool:
    """True when the key's per-day limit is used up (waiting a few seconds won't help)."""
    m = e.message.lower()
    return "per day" in m or "(rpd)" in m or "(tpd)" in m or "(asd)" in m


async def _post(label: str, path: str, timeout_s: float, waits: tuple, **kwargs) -> httpx.Response:
    """POST with retries on rate limits and hiccups (honouring Groq's retry-after)."""
    if not settings.groq_api_key:
        raise GroqError(401, "GROQ_API_KEY is not set")
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
    pending = list(waits)
    while True:
        res = await _http.post(path, headers=headers, timeout=timeout_s, **kwargs)
        if res.is_success:
            return res
        try:
            message = res.json().get("error", {}).get("message", res.text)
        except ValueError:
            message = res.text
        error = GroqError(res.status_code, message[:500])
        if res.status_code not in RETRY_CODES or not pending or is_daily_limit(error):
            raise error
        try:
            hinted = float(res.headers.get("retry-after", 0))
        except ValueError:
            hinted = 0
        wait = max(pending.pop(0), hinted)
        if wait > MAX_HINTED_WAIT:
            raise error
        log.warning("%s: Groq %s; retrying in %.0fs.", label, res.status_code, wait)
        await asyncio.sleep(wait)


# ---- Interviewer and debrief ------------------------------------------------------

def user_message(text: str) -> dict:
    return {"role": "user", "content": text}


async def interviewer_turn(system: str, messages: list) -> tuple[dict, dict]:
    """Returns the parsed turn and the assistant message to append to history."""
    data, raw = await _chat_json(
        "interviewer turn", system, messages, TURN_SCHEMA, 4096,
        settings.turn_timeout_seconds, settings.turn_reasoning,
    )
    return data, {"role": "assistant", "content": raw}


async def write_report(system: str, user_text: str) -> dict:
    data, _ = await _chat_json(
        "debrief", system, [user_message(user_text)], REPORT_SCHEMA, 16384,
        settings.report_timeout_seconds, settings.report_reasoning,
    )
    return data


async def _chat_json(
    label: str, system: str, messages: list[dict], schema: dict, max_tokens: int, timeout_s: float, effort: str
) -> tuple[dict, str]:
    """A chat call that must return JSON matching `schema`. Returns (data, raw JSON text)."""
    model = settings.groq_model
    body = {
        "model": model,
        "messages": [{"role": "system", "content": system + _json_instructions(schema)}, *messages],
        "response_format": {"type": "json_object"},
        "max_completion_tokens": max_tokens,
        "temperature": 0.7,
    }
    if model.startswith("openai/gpt-oss"):
        body["reasoning_effort"] = effort if effort in ("low", "medium", "high") else "low"
    start = time.perf_counter()
    problem = ""
    for _ in range(2):  # JSON mode is not schema-enforced: validate, and ask once more if it's off
        res = await _post(label, "/chat/completions", timeout_s, TURN_WAITS, json=body)
        payload = res.json()
        choice = (payload.get("choices") or [{}])[0]
        raw = (choice.get("message") or {}).get("content") or ""
        try:
            data = json.loads(raw)
            problem = _check(schema, data)
        except json.JSONDecodeError:
            problem = "not valid JSON"
        if choice.get("finish_reason") == "length":
            problem = "cut off"
        if not problem:
            log.info(
                "%s: %.1fs (model=%s reasoning=%s output_tokens=%s)", label, time.perf_counter() - start, model,
                body.get("reasoning_effort", "-"), payload.get("usage", {}).get("completion_tokens"),
            )
            return data, raw
        log.warning("%s: unusable output (%s); asking again.", label, problem)
    raise GroqError(502, f"unusable output ({problem})")


def _json_instructions(schema: dict) -> str:
    return (
        "\n\nRespond with a single JSON object only, no other text. It must match this JSON Schema exactly "
        "(all required fields, allowed enum values only):\n" + json.dumps(schema)
    )


_TYPES = {"object": dict, "array": list, "string": str, "integer": int, "number": (int, float), "boolean": bool}


def _check(schema: dict, value, path: str = "$") -> str:
    """Minimal JSON-Schema check (type, required, enum, items). Returns a problem, or "" if fine."""
    t = schema.get("type")
    if t and not isinstance(value, _TYPES[t]) or (t == "integer" and isinstance(value, bool)):
        return f"{path} should be {t}"
    if "enum" in schema and value not in schema["enum"]:
        return f"{path} has value outside {schema['enum']}"
    if t == "object":
        for key in schema.get("required", []):
            if key not in value:
                return f"{path}.{key} missing"
        for key, sub in schema.get("properties", {}).items():
            if key in value and (problem := _check(sub, value[key], f"{path}.{key}")):
                return problem
    if t == "array" and "items" in schema:
        for i, item in enumerate(value):
            if problem := _check(schema["items"], item, f"{path}[{i}]"):
                return problem
    return ""


# ---- Speech-to-text (used when the browser's own speech service is unavailable) ----

async def transcribe(audio: bytes, mime_type: str) -> str:
    start = time.perf_counter()
    ext = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a"}.get(mime_type, "wav")
    res = await _post(
        "transcription",
        "/audio/transcriptions",
        settings.transcribe_timeout_seconds,
        TRANSCRIBE_WAITS,
        files={"file": (f"answer.{ext}", audio, mime_type)},
        data={"model": settings.groq_transcribe_model, "language": "en", "response_format": "json", "temperature": "0"},
    )
    text = (res.json().get("text") or "").strip()
    log.info("transcription: %.1fs (model=%s)", time.perf_counter() - start, settings.groq_transcribe_model)
    return text
