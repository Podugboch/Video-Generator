"""The slow part of a video: images + voice + FFmpeg. Runs inside the worker."""
import logging
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import httpx

from . import config
from .db import db, upload
from .services import images, render, voice

log = logging.getLogger("pipeline")


def _set(project_id: str, **fields) -> None:
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    db.table("projects").update(fields).eq("id", project_id).execute()


def _download(url: str) -> bytes:
    r = httpx.get(url, timeout=60, follow_redirects=True)
    r.raise_for_status()
    return r.content


def _prepare_scene(scene: dict, user_id: str, project_id: str, tmp: Path) -> tuple[Path, Path]:
    """Make sure a scene has an image and a voiceover, and put both in tmp.

    Assets that already exist (and were not edited) are reused, not paid for again.
    """
    pos = scene["position"]
    base = f"{user_id}/{project_id}"
    image_path = tmp / f"scene{pos}.jpg"
    audio_path = tmp / f"scene{pos}.mp3"

    if scene.get("image_url"):
        image_path.write_bytes(_download(scene["image_url"]))
    else:
        data = images.generate_image(scene["visual_prompt"])
        image_path.write_bytes(data)
        url = upload(f"{base}/scene-{pos}-{uuid.uuid4().hex[:8]}.jpg", data, "image/jpeg")
        db.table("scenes").update({"image_url": url}).eq("id", scene["id"]).execute()

    if scene.get("audio_url"):
        audio_path.write_bytes(_download(scene["audio_url"]))
    else:
        data = voice.synthesize(scene["narration"])
        audio_path.write_bytes(data)
        url = upload(f"{base}/scene-{pos}-{uuid.uuid4().hex[:8]}.mp3", data, "audio/mpeg")
        db.table("scenes").update({"audio_url": url}).eq("id", scene["id"]).execute()

    return image_path, audio_path


def run_pipeline(project_id: str) -> None:
    project = db.table("projects").select("*").eq("id", project_id).single().execute().data
    user_id = project["user_id"]
    try:
        _set(project_id, status="rendering", stage="assets", error=None)
        scenes = (
            db.table("scenes").select("*").eq("project_id", project_id)
            .order("position").execute().data
        )

        with tempfile.TemporaryDirectory() as d:
            tmp = Path(d)
            with ThreadPoolExecutor(max_workers=3) as pool:
                futures = [pool.submit(_prepare_scene, s, user_id, project_id, tmp) for s in scenes]
                files = [f.result() for f in futures]

            _set(project_id, stage="video")
            items = [(img, aud, s["narration"]) for (img, aud), s in zip(files, scenes)]
            final = render.render_video(items, tmp)
            url = upload(
                f"{user_id}/{project_id}/video-{uuid.uuid4().hex[:8]}.mp4",
                final.read_bytes(),
                "video/mp4",
            )

        _set(project_id, status="done", stage=None, final_video_url=url)
    except Exception:
        log.exception("render failed for project %s", project_id)
        _set(project_id, status="failed", stage=None,
             error="Something went wrong while making the video. Your credits were refunded.")
        db.rpc("add_credits", {
            "uid": user_id, "amt": config.RENDER_COST, "why": f"refund:{project_id}",
        }).execute()
