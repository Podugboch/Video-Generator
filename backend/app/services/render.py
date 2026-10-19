"""Turns (image, narration audio, caption) triples into one MP4 with FFmpeg."""
import subprocess
from pathlib import Path

W, H, FPS = 1280, 720, 30
PAD = 0.5  # seconds of breathing room after each narration
ZOOM = 0.15  # total zoom over a scene (15%)

CAPTION_STYLE = (
    "FontName=DejaVu Sans,FontSize=16,Bold=1,PrimaryColour=&H00FFFFFF,"
    "OutlineColour=&H99000000,BorderStyle=3,Outline=3,Shadow=0,Alignment=2,MarginV=28"
)


def _run(cmd: list[str], cwd: Path) -> str:
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {r.stderr[-600:]}")
    return r.stdout


def audio_duration(audio: Path) -> float:
    out = _run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", audio.name],
        cwd=audio.parent,
    )
    return float(out.strip())


def _ts(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def build_clip(index: int, image: Path, audio: Path, caption: str, workdir: Path) -> Path:
    """One scene: slow zoom on the image + narration + burned-in caption."""
    dur = audio_duration(audio) + PAD
    frames = max(int(dur * FPS), 1)
    step = ZOOM / frames
    if index % 2 == 0:  # alternate zoom in / zoom out for variety
        zoom = f"min(zoom+{step:.6f},{1 + ZOOM})"
    else:
        zoom = f"if(eq(on,0),{1 + ZOOM},max(zoom-{step:.6f},1))"

    clean = caption.replace("{", "").replace("}", "")
    srt = workdir / f"cap{index}.srt"
    srt.write_text(f"1\n{_ts(0)} --> {_ts(max(dur - 0.1, 0.5))}\n{clean}\n", encoding="utf-8")

    vf = (
        "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,"
        f"zoompan=z='{zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
        f":d={frames}:s={W}x{H}:fps={FPS},"
        f"subtitles={srt.name}:force_style='{CAPTION_STYLE}',format=yuv420p"
    )
    out = workdir / f"clip{index}.mp4"
    _run(
        ["ffmpeg", "-y", "-i", image.name, "-i", audio.name,
         "-vf", vf, "-af", "apad", "-t", f"{dur:.3f}",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-r", str(FPS),
         "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
         out.name],
        cwd=workdir,
    )
    return out


def render_video(items: list[tuple[Path, Path, str]], workdir: Path) -> Path:
    """items = [(image, audio, caption), ...]; every file must live in workdir."""
    clips = [build_clip(i, img, aud, cap, workdir) for i, (img, aud, cap) in enumerate(items)]

    listing = workdir / "clips.txt"
    listing.write_text("".join(f"file '{c.name}'\n" for c in clips))

    out = workdir / "final.mp4"
    _run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listing.name,
         "-c", "copy", "-movflags", "+faststart", out.name],
        cwd=workdir,
    )
    return out
