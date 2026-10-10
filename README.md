# The Angry Rubber Duck

Decision-making prototype with an angry duck critic powered by Gemini (Vertex AI).

```sh
gcloud auth application-default login   # once
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000
```