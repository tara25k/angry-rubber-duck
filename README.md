# The Angry Rubber Duck

Decision-making prototype with an angry duck critic powered by Gemini (Vertex AI).

```sh
gcloud auth application-default login   # once
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000
```

## Layout

- `backend/main.py` – FastAPI endpoints (`/api/duck`, `/api/duck/wrap-up`, `/api/duck/preview`)
- `backend/payloads.py` – request models, prompt rendering, response schema
- `backend/anger.py` – anger range, progress counts, clamping
- `backend/templates/personas/<name>.json` – a persona: its `voice` and the five anger `levels`
- `backend/templates/{system.txt,wrap_up.txt,prompt.xml}` – shared prompt rules and the XML the duck reads
- `static/app.jsx` – the whole frontend (React, no build step)
