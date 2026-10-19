import os

from dotenv import load_dotenv

load_dotenv()


def _get(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


SUPABASE_URL = _get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = _get("SUPABASE_SERVICE_KEY")

ANTHROPIC_MODEL = _get("ANTHROPIC_MODEL", "claude-haiku-5-5")
FAL_IMAGE_MODEL = _get("FAL_IMAGE_MODEL", "fal-ai/flux/schnell")
ELEVENLABS_API_KEY = _get("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = _get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
PAYSTACK_SECRET_KEY = _get("PAYSTACK_SECRET_KEY")

FRONTEND_URL = _get("FRONTEND_URL", "http://localhost:5173")
REDIS_URL = _get("REDIS_URL", "redis://localhost:6379")

STORAGE_BUCKET = "media"

# Credits. A full video = 1 (storyboard) + 5 (render) = 6, which is exactly
# what a new user gets for free (see schema.sql).
STORYBOARD_COST = 1
RENDER_COST = 5

# Placeholder prices in kobo (100 kobo = 1 naira). Set your own after you know
# your real cost per video.
PACKS = {
    "starter": {"credits": 30, "amount_kobo": 200_000},
    "creator": {"credits": 100, "amount_kobo": 550_000},
}

# A job that has not updated for this long is treated as dead.
STALE_JOB_MINUTES = 20
