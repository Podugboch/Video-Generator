from fastapi import Header, HTTPException

from .db import db


def current_user(authorization: str = Header(default="")):
    """Validate the Supabase access token sent by the React app."""
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Please sign in.")
    try:
        user = db.auth.get_user(token).user
    except Exception:
        raise HTTPException(401, "Your session expired. Please sign in again.")
    if not user:
        raise HTTPException(401, "Your session expired. Please sign in again.")
    return user
