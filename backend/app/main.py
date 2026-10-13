import asyncio
import logging

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import prompts, store
from .config import settings
from .llm import GroqError, interviewer_turn, is_daily_limit, transcribe, user_message, write_report
from .schemas import AnswerRequest, EndRequest, StartRequest, TurnResponse

log = logging.getLogger("rehearse")
# Show our own info logs (call timings) next to uvicorn's.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)  # one line per Groq request is noise

app = FastAPI(title="Rehearse API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ---- Error mapping: keep upstream details out of user-facing messages ----------

@app.exception_handler(GroqError)
async def groq_error(request: Request, exc: GroqError):
    # Full upstream error goes to the server log; the browser gets a short message.
    log.error("Groq error on %s: %s", request.url.path, exc)
    if exc.status == 429:
        detail = (
            "The Groq API key has used up today's free limit. Try again tomorrow, or use another key."
            if is_daily_limit(exc)
            else "Groq is rate-limiting this API key right now. Wait a few seconds, then try again."
        )
        return JSONResponse(status_code=429, content={"detail": detail})
    if exc.status in (401, 403):
        detail = "The server's Groq API key is missing or invalid. Check GROQ_API_KEY in backend/.env."
    elif exc.status == 413:
        detail = "That was more text than Groq's free tier accepts in one go. Try again with a shorter interview or answer."
    elif exc.status == 404:
        detail = "The configured Groq model isn't available. Check GROQ_MODEL in backend/.env."
    elif exc.status == 502:
        detail = "The interviewer gave an unusable reply. Please try again."
    else:
        detail = "The AI service returned an error. Please try again."
    return JSONResponse(status_code=502, content={"detail": detail})


@app.exception_handler(httpx.TimeoutException)
async def upstream_timeout(request: Request, _: httpx.TimeoutException):
    log.error("Groq timed out on %s", request.url.path)
    return JSONResponse(status_code=504, content={"detail": "The interviewer took too long to respond. Please try again."})


@app.exception_handler(httpx.TransportError)
async def upstream_unreachable(_: Request, __: httpx.TransportError):
    return JSONResponse(status_code=503, content={"detail": "Couldn't reach the AI service. Check your connection."})


# ---- Helpers --------------------------------------------------------------------

async def _session_or_404(session_id: str) -> store.Session:
    session = await store.get(session_id)
    if session is None:
        raise HTTPException(404, "This interview has expired. Start a new one.")
    return session


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")


def _turn_response(session: store.Session, text: str, kind: str) -> TurnResponse:
    return TurnResponse(
        session_id=session.id,
        message=text,
        kind=kind,
        question_number=session.main_asked,
        total_questions=session.config.num_questions,
        done=session.done,
    )


async def _ask(session: store.Session, user_content: str) -> tuple[str, str]:
    """Send one user message, apply the interviewer's chosen action, return (text, kind)."""
    cfg = session.config
    pending = session.messages + [user_message(user_content)]
    turn, content = await interviewer_turn(prompts.interviewer_system(cfg), pending)

    # Commit history only after a successful call, so a failed request can be retried.
    session.messages = pending + [content]

    action = turn["action"]
    # Hard caps in case the model drifts from the state note.
    if action == "follow_up" and session.follow_ups >= settings.max_follow_ups:
        action = "question" if session.main_asked < cfg.num_questions else "wrap_up"
    if action == "question" and session.main_asked >= cfg.num_questions:
        action = "wrap_up"

    if action == "follow_up":
        session.follow_ups += 1
        kind = "follow_up"
    elif action == "question":
        session.main_asked += 1
        session.follow_ups = 0
        kind = "question"
    else:
        session.done = True
        kind = "closing"

    session.transcript.append(
        {"speaker": "interviewer", "text": turn["reply"], "kind": kind, "question": session.main_asked}
    )
    return turn["reply"], kind


# ---- Routes ---------------------------------------------------------------------

@app.get("/api/health")
async def health():
    # Whether this process loaded an AI key (never the key itself), and where sessions are kept.
    return {"ok": True, "groq": bool(settings.groq_api_key), "sessions": store.backend_name()}


@app.post("/api/sessions", response_model=TurnResponse)
async def start_session(body: StartRequest, request: Request):
    if not await store.allow_new_session(_client_ip(request)):
        raise HTTPException(429, "Daily practice limit reached for this demo. Come back tomorrow.")
    session = store.create(body)
    text, kind = await _ask(session, prompts.opening_message(body))
    if kind != "question":  # the opening turn always counts as question 1
        session.main_asked, session.done, kind = 1, False, "question"
        session.transcript[-1].update(kind="question", question=1)
    await store.save(session)
    return _turn_response(session, text, kind)


@app.post("/api/sessions/{session_id}/answer", response_model=TurnResponse)
async def answer(session_id: str, body: AnswerRequest):
    session = await _session_or_404(session_id)
    if session.done:
        raise HTTPException(409, "This interview is already finished.")

    answer_text = body.answer.strip()
    question = session.main_asked
    note = prompts.state_note(question, session.config.num_questions, session.follow_ups)
    text, kind = await _ask(session, prompts.answer_message(answer_text, note))
    # Record the answer only once the call succeeded (so retries don't duplicate it),
    # placed before the interviewer reply that _ask just appended.
    session.transcript.insert(
        len(session.transcript) - 1,
        {"speaker": "candidate", "text": answer_text, "kind": "answer", "question": question},
    )
    # If the interview was ended while the model was replying, keep it ended.
    latest = await store.get(session_id)
    if latest and latest.done and not session.done:
        session.done, session.ended_by = True, latest.ended_by
    await store.save(session)
    return _turn_response(session, text, kind)


AUDIO_TYPES = {"audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4"}


@app.post("/api/transcribe")
async def transcribe_audio(request: Request):
    """Fallback speech-to-text: the browser records the answer, Groq's Whisper transcribes it."""
    mime = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if mime not in AUDIO_TYPES:
        raise HTTPException(415, "Send the recording as audio (WAV preferred).")
    audio = await request.body()
    if len(audio) > settings.max_audio_bytes:
        raise HTTPException(413, "That answer is too long to transcribe in one go. Try a shorter answer.")
    if len(audio) < 2000:  # well under a quarter of a second: nothing to transcribe
        return {"text": ""}
    if not await store.allow_transcription(_client_ip(request)):
        raise HTTPException(429, "Daily voice limit reached for this demo. You can still type your answers.")
    return {"text": await transcribe(audio, "audio/wav" if mime == "audio/x-wav" else mime)}


@app.post("/api/sessions/{session_id}/end")
async def end_session(session_id: str, body: EndRequest | None = None):
    session = await _session_or_404(session_id)
    last = body.answer.strip() if body else ""
    if not session.done:
        if last:
            session.transcript.append(
                {"speaker": "candidate", "text": last, "kind": "answer", "question": session.main_asked}
            )
        session.ended_by = body.reason if body else "submitted"
    session.done = True
    await store.save(session)
    return {"ok": True, "answers": session.answers}


@app.post("/api/sessions/{session_id}/report")
async def report(session_id: str):
    session = await _session_or_404(session_id)
    if session.report is not None:
        return session.report
    if session.answers == 0:
        if session.ended_by == "warnings":
            raise HTTPException(400, "The interview was ended after 3 warnings, before any answer, so there's no debrief.")
        raise HTTPException(400, "Answer at least one question to get a debrief.")
    session.done = True

    lines = []
    for t in session.transcript:
        if t["speaker"] == "interviewer":
            label = {"question": f"Interviewer (main question {t['question']})",
                     "follow_up": f"Interviewer (follow-up on question {t['question']})",
                     "closing": "Interviewer (closing)"}[t["kind"]]
        else:
            label = "Candidate"
        lines.append(f"{label}: {t['text']}")
    if session.ended_by == "warnings":
        lines.append(
            f"[The interview was ended automatically after {session.answers} answer(s): the candidate got a third "
            "warning for leaving the interview tab or using a browser extension. Mention this briefly in the summary.]"
        )
    elif session.main_asked < session.config.num_questions or session.transcript[-1]["kind"] != "closing":
        lines.append(f"[The candidate ended the interview early, after {session.answers} answer(s).]")

    task = store.report_tasks.get(session_id)
    if task is None:
        task = store.report_tasks[session_id] = asyncio.create_task(
            write_report(prompts.report_system(session.config), prompts.report_user_message("\n\n".join(lines)))
        )
    try:
        session.report = await asyncio.shield(task)
    finally:
        store.report_tasks.pop(session_id, None)  # done, or failed (so a retry starts afresh)
    await store.save(session)
    return session.report
