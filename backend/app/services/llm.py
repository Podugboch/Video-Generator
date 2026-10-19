import json
import re

import anthropic

from .. import config

SYSTEM = """You write scripts for 30-second explainer videos for a general audience.
Return ONLY a JSON object, with no markdown, in exactly this shape:
{"refused": false, "title": "...", "scenes": [{"narration": "...", "visual_prompt": "..."}]}

Rules:
- 5 or 6 scenes. Total narration of 70 to 80 words (about 30 seconds spoken).
- narration: plain spoken sentences in simple words. One idea per scene. A strong hook in scene 1 and a clear takeaway in the last scene. No stage directions, no emojis.
- visual_prompt: one concrete image per scene, under 30 words. Describe subjects, setting and mood only. Never ask for text, words, numbers or logos inside the image.
- If the topic asks for sexual content, graphic violence, hate, harassment, self-harm instructions, illegal activity, or content about real private individuals, return {"refused": true, "reason": "<short reason>"} instead."""


class StoryboardRefused(Exception):
    pass


def parse_storyboard(text: str) -> dict:
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    data = json.loads(text)

    if data.get("refused"):
        raise StoryboardRefused(str(data.get("reason") or "not allowed"))

    scenes = data.get("scenes")
    if not isinstance(scenes, list) or not 3 <= len(scenes) <= 8:
        raise ValueError("storyboard needs between 3 and 8 scenes")

    cleaned = []
    for s in scenes:
        narration = str(s.get("narration", "")).strip()
        visual = str(s.get("visual_prompt", "")).strip()
        if not narration or not visual:
            raise ValueError("scene is missing narration or visual_prompt")
        cleaned.append({"narration": narration[:400], "visual_prompt": visual[:500]})

    return {"title": str(data.get("title") or "Untitled video").strip()[:120], "scenes": cleaned}


def make_storyboard(topic: str) -> dict:
    client = anthropic.Anthropic()
    msg = client.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=1500,
        system=SYSTEM,
        messages=[{"role": "user", "content": f"Topic: {topic}"}],
    )
    text = "".join(b.text for b in msg.content if b.type == "text")
    return parse_storyboard(text)
