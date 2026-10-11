"""Request models and prompt rendering. Prompt text lives in templates/ (personas hold voice + levels).

Run `python payloads.py` to print the prompt rendered from templates/request.example.json.
"""

import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from pydantic import BaseModel

from anger import progress

TEMPLATES = Path(__file__).parent / "templates"

# A persona is templates/personas/<name>.json: {"voice": "...", "levels": {"1": "...", ..., "5": "..."}}
PERSONAS = {p.stem: json.loads(p.read_text()) for p in (TEMPLATES / "personas").glob("*.json")}
SYSTEM_RULES = (TEMPLATES / "system.txt").read_text()
WRAP_UP = (TEMPLATES / "wrap_up.txt").read_text()

# What Gemini must answer with (Gemini's schema dialect)
RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "propertyOrdering": ["anger", "anger_reason", "reply", "comments"],
    "properties": {
        "anger": {"type": "INTEGER"},
        "anger_reason": {"type": "STRING"},
        "reply": {"type": "STRING"},
        "comments": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {"quote": {"type": "STRING"}, "text": {"type": "STRING"}},
                "required": ["quote", "text"],
            },
        },
    },
    "required": ["anger", "anger_reason", "reply", "comments"],
}

_env = Environment(
    loader=FileSystemLoader(TEMPLATES),
    autoescape=True,  # user text is XML-escaped
    trim_blocks=True,
    lstrip_blocks=True,
)


class Turn(BaseModel):
    role: str  # "user" | "duck"
    text: str


class Draft(BaseModel):
    title: str
    body: str


class Comment(BaseModel):
    quote: str
    text: str
    resolved: bool = False
    resolution: str | None = None  # "edited" | "addressed" | "kept"
    reason: str | None = None  # why the user kept it as is


class DuckRequest(BaseModel):
    persona: str = "critic"
    title: str  # the decision being made
    body: str  # context: options, pros and cons...
    note: str | None = None  # optional facts the text doesn't contain
    made_changes: bool = True  # title, body or comment resolutions changed since the last round
    first_draft: Draft | None = None  # title/body as of round 1
    history: list[Turn] = []  # full chat; only the last round is used
    comments: list[Comment] = []  # every comment the duck has made so far
    anger: int | None = None  # the duck's level last round (None before round 1)


def select_previous_round(history: list[Turn]) -> dict | None:
    """The last round: the final duck reply plus the user message before it, if any."""
    for i in range(len(history) - 1, -1, -1):
        if history[i].role != "user":
            user = history[i - 1].text if i > 0 and history[i - 1].role == "user" else None
            return {"user": user, "duck": history[i].text}
    return None


def render_prompt(req: DuckRequest) -> str:
    return _env.get_template("prompt.xml").render(
        title=req.title,
        body=req.body,
        note=req.note,
        first_draft=req.first_draft,
        previous_round=select_previous_round(req.history),
        comments=req.comments,
        progress=progress(req),
    )


def system_instruction(persona: str) -> str:
    p = PERSONAS[persona]
    levels = "\n".join(f"{n} - {text}" for n, text in sorted(p["levels"].items()))
    return f"{p['voice']}\n{SYSTEM_RULES}\nAnger levels:\n{levels}"


def wrap_up_instruction(persona: str) -> str:
    return PERSONAS[persona]["voice"] + "\n" + WRAP_UP


def _norm(s: str) -> str:
    return " ".join(s.lower().split())


def filter_comments(new: list[dict], req: DuckRequest) -> list[dict]:
    """Drop comments whose quote isn't in the decision, or that repeat an existing comment."""
    source = f"{req.title}\n{req.body}"
    seen = {(_norm(c.quote), _norm(c.text)) for c in req.comments}
    kept = []
    for c in new:
        key = (_norm(c["quote"]), _norm(c["text"]))
        if c["quote"] in source and key not in seen:
            seen.add(key)
            kept.append(c)
    return kept[:3]


if __name__ == "__main__":
    example = DuckRequest.model_validate_json((TEMPLATES / "request.example.json").read_text())
    print(system_instruction(example.persona))
    print("-" * 60)
    print(render_prompt(example))
