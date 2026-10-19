from supabase import create_client

from . import config

db = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)


def upload(path: str, data: bytes, content_type: str) -> str:
    """Upload bytes to the public media bucket and return the public URL."""
    bucket = db.storage.from_(config.STORAGE_BUCKET)
    bucket.upload(path, data, {"content-type": content_type, "upsert": "true"})
    return bucket.get_public_url(path).rstrip("?")
