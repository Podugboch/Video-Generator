import asyncio

from arq.connections import RedisSettings

from . import config
from .pipeline import run_pipeline


async def render_job(ctx, project_id: str) -> None:
    # run_pipeline is blocking (network + FFmpeg), so keep it off the event loop
    await asyncio.to_thread(run_pipeline, project_id)


class WorkerSettings:
    functions = [render_job]
    redis_settings = RedisSettings.from_dsn(config.REDIS_URL)
    job_timeout = 900  # 15 minutes
    max_tries = 1      # never retry: a retry would spend API money twice
    max_jobs = 2
