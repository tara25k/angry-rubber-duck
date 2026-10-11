import json
import os
from pathlib import Path

os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "True")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "")  # set to your Google Cloud project ID
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "")  # set to your Google Cloud location

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import types

from anger import clamp
from payloads import (
    PERSONAS,
    RESPONSE_SCHEMA,
    DuckRequest,
    filter_comments,
    render_prompt,
    system_instruction,
    wrap_up_instruction,
)

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

app = FastAPI()
client = genai.Client()


def generate(req: DuckRequest, system: str, **config) -> str:
    """Send the rendered prompt to Gemini and return its text."""
    if req.persona not in PERSONAS:
        raise HTTPException(400, "unknown persona")
    try:
        resp = client.models.generate_content(
            model=MODEL,
            contents=render_prompt(req),
            config=types.GenerateContentConfig(system_instruction=system, **config),
        )
        return resp.text
    except Exception as e:
        raise HTTPException(502, f"The duck is unavailable: {e}")


@app.post("/api/duck/preview")
def preview(req: DuckRequest):
    """What Gemini would receive for this request, without calling it."""
    return {
        "system_instruction": system_instruction(req.persona),
        "prompt": render_prompt(req),
    }


@app.post("/api/duck")
def duck(req: DuckRequest):
    text = generate(
        req,
        system_instruction(req.persona),
        response_mime_type="application/json",
        response_schema=RESPONSE_SCHEMA,
    )
    data = json.loads(text)

    return {
        "reply": data.get("reply", "Quack."),
        "comments": filter_comments(data.get("comments", []), req),
        "anger": clamp(data.get("anger"), req),
        "anger_reason": data.get("anger_reason", ""),
    }


@app.post("/api/duck/wrap-up")
def wrap_up(req: DuckRequest):
    """The user has decided: a short summary of what changed, plus a congratulation."""
    return {"summary": generate(req, wrap_up_instruction(req.persona)).strip()}


app.mount(
    "/",
    StaticFiles(directory=Path(__file__).parent.parent / "static", html=True),
    name="static",
)
