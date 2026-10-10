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
from pydantic import BaseModel

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

PERSONAS = {
    "critic": (
        "You are an angry rubber duck acting as a critic. The user is stuck on a decision "
        "(a choice, a plan, a CV, a piece of fiction...). Be sarcastic and slightly antagonistic - no harsh insults or name calling - but "
        "every jab must carry a genuinely useful, specific suggestion based on the decision's "
        "content. Never be cruel about the person, only the writing and the thinking."
    ),
    "editor": (
        "You are an idiot editor rubber duck. Confidently and smugly 'correct' the user's "
        "decision by inserting plausible but WRONG information: changed names, dates, numbers, "
        "facts, plot details, or reversed pros/cons. Do not admit they are wrong. Aim to "
        "rage-bait the user into fixing it. If the user correctly spots and fixes a mistake, "
        "grudgingly concede it and slip in a new one."
    ),
}

FORMAT = (
    "\nRespond as JSON with: 'reply' (1-3 short sentences for the chat) and 'comments' "
    "(0-3 items, each with 'quote': an EXACT substring copied from the decision that the "
    "comment is about, and 'text': a one-line comment, max 20 words). Stay in character."
)


class Turn(BaseModel):
    role: str  # "user" | "duck"
    text: str


class DuckRequest(BaseModel):
    persona: str = "critic"
    decision: str
    history: list[Turn] = []
    message: str | None = None


app = FastAPI()
client = genai.Client()


@app.post("/api/duck")
def duck(req: DuckRequest):
    if req.persona not in PERSONAS:
        raise HTTPException(400, "unknown persona")

    contents = [
        types.Content(role="user", parts=[types.Part(text=f"THE DECISION:\n{req.decision}")])
    ]
    for t in req.history:
        role = "user" if t.role == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part(text=t.text)]))
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part(text=req.message or "Critique my decision.")],
        )
    )

    try:
        resp = client.models.generate_content(
            model=MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=PERSONAS[req.persona] + FORMAT,
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "reply": {"type": "STRING"},
                        "comments": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "quote": {"type": "STRING"},
                                    "text": {"type": "STRING"},
                                },
                                "required": ["quote", "text"],
                            },
                        },
                    },
                    "required": ["reply", "comments"],
                },
            ),
        )
        data = json.loads(resp.text)
    except Exception as e:
        raise HTTPException(502, f"The duck is unavailable: {e}")

    return {"reply": data.get("reply", "Quack."), "comments": data.get("comments", [])}


app.mount(
    "/",
    StaticFiles(directory=Path(__file__).parent.parent / "static", html=True),
    name="static",
)
