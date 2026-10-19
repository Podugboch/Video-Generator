import httpx

from .. import config


def synthesize(text: str) -> bytes:
    """Return MP3 bytes of the narration."""
    r = httpx.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{config.ELEVENLABS_VOICE_ID}",
        headers={"xi-api-key": config.ELEVENLABS_API_KEY},
        params={"output_format": "mp3_44100_128"},
        json={"text": text, "model_id": "eleven_flash_v2_5"},
        timeout=120,
    )
    r.raise_for_status()
    return r.content
