import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Groq: free key from https://console.groq.com/keys
    groq_api_key = os.getenv("GROQ_API_KEY", "").strip()
    groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    groq_transcribe_model = os.getenv("GROQ_TRANSCRIBE_MODEL", "whisper-large-v3-turbo")
    allowed_origins = [
        o.strip()
        for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
        if o.strip()
    ]
    max_sessions_per_ip_per_day = int(os.getenv("MAX_SESSIONS_PER_IP_PER_DAY", "15"))

    # Upstash Redis (REST) for sessions, needed on serverless hosts like Vercel. Empty = in memory.
    # The Vercel Marketplace integration sets the KV_REST_API_* names.
    redis_url = (os.getenv("UPSTASH_REDIS_REST_URL") or os.getenv("KV_REST_API_URL") or "").strip().rstrip("/")
    redis_token = (os.getenv("UPSTASH_REDIS_REST_TOKEN") or os.getenv("KV_REST_API_TOKEN") or "").strip()

    # Speed. Interviewer turns are short spoken replies, so the model reasons briefly;
    # the debrief is a careful written analysis, so it may reason longer. Values: low | medium | high.
    turn_reasoning = os.getenv("TURN_REASONING", "low").lower()
    report_reasoning = os.getenv("REPORT_REASONING", "medium").lower()
    turn_timeout_seconds = float(os.getenv("TURN_TIMEOUT_SECONDS", "45"))
    transcribe_timeout_seconds = float(os.getenv("TRANSCRIBE_TIMEOUT_SECONDS", "40"))
    report_timeout_seconds = float(os.getenv("REPORT_TIMEOUT_SECONDS", "150"))
    # Server-side transcription (fallback when the browser's speech service is unavailable).
    max_transcriptions_per_ip_per_day = int(os.getenv("MAX_TRANSCRIPTIONS_PER_IP_PER_DAY", "400"))
    max_audio_bytes = 4 * 1024 * 1024  # ~2 minutes of 16 kHz mono WAV; Vercel caps request bodies at 4.5 MB

    # Interview shape
    max_follow_ups = 2          # per main question
    session_ttl_seconds = 2 * 60 * 60


settings = Settings()
