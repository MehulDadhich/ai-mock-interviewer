"""Session store and per-IP limits.

With Upstash Redis configured (UPSTASH_REDIS_REST_URL / _TOKEN, or the KV_REST_API_URL /
_TOKEN pair the Vercel Marketplace integration adds), sessions live in Redis, so any
serverless instance can serve any request of an interview. Without it, everything stays
in this process's memory: fine for local development and a single long-running server.
"""

import asyncio
import json
import time
import uuid
from collections import defaultdict
from dataclasses import asdict, dataclass, field

import httpx

from .config import settings
from .schemas import StartRequest


@dataclass
class Session:
    config: StartRequest
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    created_at: float = field(default_factory=time.time)
    messages: list = field(default_factory=list)      # chat history sent to the model
    transcript: list = field(default_factory=list)    # [{speaker, text, kind, question}]
    main_asked: int = 0
    follow_ups: int = 0
    done: bool = False
    ended_by: str | None = None  # "submitted" | "warnings" when ended before completion
    report: dict | None = None

    @property
    def answers(self) -> int:
        return sum(1 for t in self.transcript if t["speaker"] == "candidate")

    def to_json(self) -> str:
        data = asdict(self)
        data["config"] = self.config.model_dump()
        return json.dumps(data)

    @classmethod
    def from_json(cls, raw: str) -> "Session":
        data = json.loads(raw)
        data["config"] = StartRequest.model_validate(data["config"])
        return cls(**data)


# In-flight debriefs in this process, shared by duplicate requests (not persisted).
report_tasks: dict[str, asyncio.Task] = {}

DAY = 24 * 60 * 60


# ---- Redis (Upstash REST API) ---------------------------------------------------

_redis = (
    httpx.AsyncClient(
        base_url=settings.redis_url,
        headers={"Authorization": f"Bearer {settings.redis_token}"},
        timeout=10,
    )
    if settings.redis_url and settings.redis_token
    else None
)


async def _pipeline(*commands: list) -> list:
    res = await _redis.post("/pipeline", json=[[str(part) for part in c] for c in commands])
    res.raise_for_status()
    results = res.json()
    for r in results:
        if "error" in r:
            raise RuntimeError(f"Redis error: {r['error']}")
    return [r["result"] for r in results]


def _key(session_id: str) -> str:
    return f"rehearse:session:{session_id}"


# ---- In-memory fallback ---------------------------------------------------------

_sessions: dict[str, Session] = {}
_ip_log: dict[str, list[float]] = defaultdict(list)


def _prune() -> None:
    cutoff = time.time() - settings.session_ttl_seconds
    for sid in [sid for sid, s in _sessions.items() if s.created_at < cutoff]:
        del _sessions[sid]


# ---- Public API -------------------------------------------------------------------

def create(config: StartRequest) -> Session:
    """A new session; it's stored by the first `save`."""
    return Session(config=config)


async def get(session_id: str) -> Session | None:
    if _redis is None:
        return _sessions.get(session_id)
    (raw,) = await _pipeline(["GET", _key(session_id)])
    return Session.from_json(raw) if raw else None


async def save(session: Session) -> None:
    if _redis is None:
        _prune()
        _sessions[session.id] = session
        return
    left = max(60, int(session.created_at + settings.session_ttl_seconds - time.time()))
    await _pipeline(["SET", _key(session.id), session.to_json(), "EX", left])


async def _allow(kind: str, ip: str, limit: int) -> bool:
    if _redis is None:
        log = _ip_log[f"{kind}:{ip}"]
        log[:] = [t for t in log if t > time.time() - DAY]
        if len(log) >= limit:
            return False
        log.append(time.time())
        return True
    # One counter per IP per day.
    key = f"rehearse:limit:{kind}:{ip}:{int(time.time() // DAY)}"
    count, _ = await _pipeline(["INCR", key], ["EXPIRE", key, DAY])
    return int(count) <= limit


async def allow_new_session(ip: str) -> bool:
    return await _allow("start", ip, settings.max_sessions_per_ip_per_day)


async def allow_transcription(ip: str) -> bool:
    return await _allow("transcribe", ip, settings.max_transcriptions_per_ip_per_day)


def backend_name() -> str:
    return "redis" if _redis is not None else "memory"
