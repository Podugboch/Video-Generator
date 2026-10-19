from supabase import create_client

from . import config

_client = None

def get_db():
    global _client
    if _client is None:
        if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables must be configured.")
        _client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
    return _client


class _DBProxy:
    def __getattr__(self, name):
        return getattr(get_db(), name)


db = _DBProxy()


def upload(path: str, data: bytes, content_type: str) -> str:
    """Upload bytes to the public media bucket and return the public URL."""
    bucket = db.storage.from_(config.STORAGE_BUCKET)
    bucket.upload(path, data, {"content-type": content_type, "upsert": "true"})
    return bucket.get_public_url(path).rstrip("?")
