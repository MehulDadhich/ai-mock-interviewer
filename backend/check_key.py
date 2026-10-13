"""Check the Groq key in .env and that the configured models are available to it.

Run from the backend folder (venv active):  python check_key.py
"""

import httpx

from app.config import settings
from app.llm import BASE

if not settings.groq_api_key:
    raise SystemExit("GROQ_API_KEY is empty in backend/.env")

res = httpx.get(f"{BASE}/models", headers={"Authorization": f"Bearer {settings.groq_api_key}"}, timeout=20)
if res.status_code in (401, 403):
    raise SystemExit("The key was rejected. Create a new one at https://console.groq.com/keys")
res.raise_for_status()
models = sorted(m["id"] for m in res.json().get("data", []))
print("Key works. Models available:")
for m in models:
    print("  " + m)
for name, model in (("GROQ_MODEL", settings.groq_model), ("GROQ_TRANSCRIBE_MODEL", settings.groq_transcribe_model)):
    print(f"{name}={model}: " + ("OK" if model in models else "NOT AVAILABLE, pick one from the list above"))
