import hashlib
import hmac
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import httpx
from arq import create_pool
from arq.connections import RedisSettings
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config
from .auth import current_user
from .db import db
from .services import llm

log = logging.getLogger("api")
ACTIVE = ("queued", "rendering")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = await create_pool(RedisSettings.from_dsn(config.REDIS_URL))
    yield
    await app.state.redis.close()


app = FastAPI(title="VideoGen API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_URL],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- helpers ----------
def _refund(user_id: str, amount: int, why: str) -> None:
    db.rpc("add_credits", {"uid": user_id, "amt": amount, "why": why}).execute()


def _is_active(project: dict) -> bool:
    """True if a render is genuinely in progress (not a stale, dead job)."""
    if project["status"] not in ACTIVE:
        return False
    updated = datetime.fromisoformat(project["updated_at"])
    return datetime.now(timezone.utc) - updated < timedelta(minutes=config.STALE_JOB_MINUTES)


def _user_is_busy(user_id: str) -> bool:
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=config.STALE_JOB_MINUTES)).isoformat()
    res = (
        db.table("projects").select("id", count="exact")
        .eq("user_id", user_id).in_("status", list(ACTIVE)).gt("updated_at", cutoff)
        .execute()
    )
    return (res.count or 0) > 0


def _get_project(project_id: str, user_id: str) -> dict:
    rows = (
        db.table("projects").select("*")
        .eq("id", project_id).eq("user_id", user_id).execute().data
    )
    if not rows:
        raise HTTPException(404, "Project not found.")
    return rows[0]


def _project_with_scenes(project_id: str, user_id: str) -> dict:
    project = _get_project(project_id, user_id)
    project["scenes"] = (
        db.table("scenes").select("*").eq("project_id", project_id)
        .order("position").execute().data
    )
    return project


def _paystack_headers() -> dict:
    return {"Authorization": f"Bearer {config.PAYSTACK_SECRET_KEY}"}


# ---------- request bodies ----------
class NewProject(BaseModel):
    topic: str = Field(min_length=3, max_length=300)


class ScenePatch(BaseModel):
    narration: str | None = Field(default=None, min_length=1, max_length=400)
    visual_prompt: str | None = Field(default=None, min_length=1, max_length=500)
    regenerate_image: bool = False


class Checkout(BaseModel):
    pack: str


class Verify(BaseModel):
    reference: str


# ---------- routes ----------
@app.get("/health")
def health():
    return {"ok": True}


@app.get("/me")
def me(user=Depends(current_user)):
    rows = db.table("profiles").select("credits").eq("id", user.id).execute().data
    if not rows:  # user existed before the signup trigger was installed
        rows = db.table("profiles").insert({"id": user.id}).execute().data
    return {
        "email": user.email,
        "credits": rows[0]["credits"],
        "storyboard_cost": config.STORYBOARD_COST,
        "render_cost": config.RENDER_COST,
        "packs": [{"id": k, **v} for k, v in config.PACKS.items()],
    }


@app.get("/projects")
def list_projects(user=Depends(current_user)):
    return (
        db.table("projects")
        .select("id,topic,title,status,final_video_url,created_at")
        .eq("user_id", user.id).order("created_at", desc=True).limit(50)
        .execute().data
    )


@app.post("/projects")
def create_project(body: NewProject, user=Depends(current_user)):
    topic = body.topic.strip()
    paid = db.rpc("deduct_credits", {
        "uid": user.id, "amt": config.STORYBOARD_COST, "why": "storyboard",
    }).execute().data
    if not paid:
        raise HTTPException(402, "You're out of credits. Buy more to continue.")

    try:
        board = llm.make_storyboard(topic)
        project = db.table("projects").insert(
            {"user_id": user.id, "topic": topic, "title": board["title"]}
        ).execute().data[0]
        db.table("scenes").insert([
            {"project_id": project["id"], "position": i, **s}
            for i, s in enumerate(board["scenes"])
        ]).execute()
    except llm.StoryboardRefused as e:
        _refund(user.id, config.STORYBOARD_COST, "refund:storyboard")
        raise HTTPException(422, f"That topic can't be used ({e}). Try a different one.")
    except Exception:
        log.exception("storyboard failed")
        _refund(user.id, config.STORYBOARD_COST, "refund:storyboard")
        raise HTTPException(502, "Couldn't write the storyboard. Your credit was refunded. Try again.")

    return _project_with_scenes(project["id"], user.id)


@app.get("/projects/{project_id}")
def get_project(project_id: str, user=Depends(current_user)):
    return _project_with_scenes(project_id, user.id)


@app.patch("/scenes/{scene_id}")
def edit_scene(scene_id: str, body: ScenePatch, user=Depends(current_user)):
    rows = (
        db.table("scenes")
        .select("*, projects!inner(id, user_id, status, updated_at)")
        .eq("id", scene_id).execute().data
    )
    if not rows or rows[0]["projects"]["user_id"] != user.id:
        raise HTTPException(404, "Scene not found.")
    scene = rows[0]
    project = scene.pop("projects")
    if _is_active(project):
        raise HTTPException(409, "Wait for the video to finish before editing.")

    changes: dict = {}
    if body.narration is not None and body.narration.strip() != scene["narration"]:
        changes["narration"] = body.narration.strip()
        changes["audio_url"] = None  # new text needs a new voiceover
    if body.visual_prompt is not None and body.visual_prompt.strip() != scene["visual_prompt"]:
        changes["visual_prompt"] = body.visual_prompt.strip()
        changes["image_url"] = None  # new prompt needs a new image
    if body.regenerate_image:
        changes["image_url"] = None

    if changes:
        db.table("scenes").update(changes).eq("id", scene_id).execute()
        db.table("projects").update({"status": "draft"}).eq("id", project["id"]).execute()
        scene.update(changes)
    return scene


def _prepare_render(project_id: str, user_id: str) -> None:
    project = _get_project(project_id, user_id)
    if _user_is_busy(user_id):
        raise HTTPException(409, "A video is already being made. Wait for it to finish.")
    if project["status"] == "done":
        # editing a scene sets the project back to "draft", so "done" means up to date
        raise HTTPException(409, "This video is up to date. Edit a scene to make a new version.")

    paid = db.rpc("deduct_credits", {
        "uid": user_id, "amt": config.RENDER_COST, "why": f"render:{project_id}",
    }).execute().data
    if not paid:
        raise HTTPException(402, "You're out of credits. Buy more to continue.")

    db.table("projects").update({
        "status": "queued", "stage": None, "error": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", project_id).execute()


@app.post("/projects/{project_id}/render")
async def render_project(project_id: str, request: Request, user=Depends(current_user)):
    await run_in_threadpool(_prepare_render, project_id, user.id)
    try:
        await request.app.state.redis.enqueue_job("render_job", project_id)
    except Exception:
        log.exception("enqueue failed")
        await run_in_threadpool(_refund, user.id, config.RENDER_COST, f"refund:{project_id}")
        await run_in_threadpool(
            lambda: db.table("projects").update({"status": "draft"}).eq("id", project_id).execute()
        )
        raise HTTPException(503, "The video queue is unavailable. Your credits were refunded.")
    return {"status": "queued"}


# ---------- payments (Paystack) ----------
@app.post("/credits/checkout")
def checkout(body: Checkout, user=Depends(current_user)):
    pack = config.PACKS.get(body.pack)
    if not pack:
        raise HTTPException(400, "Unknown credit pack.")
    if not config.PAYSTACK_SECRET_KEY:
        raise HTTPException(503, "Payments are not set up yet.")

    reference = f"vg_{uuid.uuid4().hex}"
    db.table("payments").insert({
        "reference": reference, "user_id": user.id,
        "credits": pack["credits"], "amount_kobo": pack["amount_kobo"],
    }).execute()

    r = httpx.post(
        "https://api.paystack.co/transaction/initialize",
        headers=_paystack_headers(),
        json={
            "email": user.email, "amount": pack["amount_kobo"], "currency": "NGN",
            "reference": reference, "callback_url": f"{config.FRONTEND_URL}/",
        },
        timeout=30,
    )
    body_json = r.json() if r.content else {}
    if r.status_code != 200 or not body_json.get("status"):
        log.error("paystack init failed: %s", r.text[:300])
        raise HTTPException(502, "Couldn't start the payment. Try again.")
    return {"url": body_json["data"]["authorization_url"]}


def _fulfill_if_valid(reference: str, paid_kobo: int | None) -> bool:
    rows = db.table("payments").select("*").eq("reference", reference).execute().data
    if not rows or paid_kobo != rows[0]["amount_kobo"]:
        return False
    return bool(db.rpc("fulfill_payment", {"p_reference": reference}).execute().data)


@app.post("/credits/verify")
def verify_payment(body: Verify, user=Depends(current_user)):
    """Called by the React app after Paystack redirects back. Works without a webhook."""
    rows = (
        db.table("payments").select("*")
        .eq("reference", body.reference).eq("user_id", user.id).execute().data
    )
    if not rows:
        raise HTTPException(404, "Payment not found.")
    if rows[0]["status"] == "success":
        return {"credited": False, "status": "success"}

    r = httpx.get(
        f"https://api.paystack.co/transaction/verify/{body.reference}",
        headers=_paystack_headers(), timeout=30,
    )
    data = (r.json() or {}).get("data") or {}
    credited = False
    if data.get("status") == "success":
        credited = _fulfill_if_valid(body.reference, data.get("amount"))
    return {"credited": credited, "status": data.get("status", "unknown")}


@app.post("/webhooks/paystack")
async def paystack_webhook(request: Request):
    raw = await request.body()
    signature = request.headers.get("x-paystack-signature", "")
    expected = hmac.new(config.PAYSTACK_SECRET_KEY.encode(), raw, hashlib.sha512).hexdigest()
    if not config.PAYSTACK_SECRET_KEY or not hmac.compare_digest(signature, expected):
        raise HTTPException(401, "Bad signature.")

    event = json.loads(raw)
    if event.get("event") == "charge.success":
        data = event.get("data") or {}
        await run_in_threadpool(_fulfill_if_valid, data.get("reference", ""), data.get("amount"))
    return {"ok": True}
