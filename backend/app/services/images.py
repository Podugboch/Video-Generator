import fal_client
import httpx

from .. import config

# Added to every prompt so all scenes share one look.
STYLE = (
    "clean flat vector illustration, warm friendly colors, simple shapes, "
    "soft lighting, no text, no letters, no numbers, no logos"
)


def generate_image(prompt: str) -> bytes:
    result = fal_client.subscribe(
        config.FAL_IMAGE_MODEL,
        arguments={
            "prompt": f"{prompt}. {STYLE}",
            "image_size": "landscape_16_9",
            "num_images": 1,
            "output_format": "jpeg",
            "enable_safety_checker": True,
        },
    )
    url = result["images"][0]["url"]
    r = httpx.get(url, timeout=60, follow_redirects=True)
    r.raise_for_status()
    return r.content
