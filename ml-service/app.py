"""
Let's Yap - toxicity scoring microservice.

Wraps Detoxify's *multilingual* model (XLM-RoBERTa fine-tuned on the Jigsaw
multilingual toxic-comment data) behind a tiny HTTP API so the Node chat
server can score messages without loading PyTorch itself.

Run locally:   uvicorn app:app --port 8001
Env:
  ML_SERVICE_KEY   shared secret; callers must send it as the X-API-Key header
                   (if unset, auth is disabled - fine for local dev only)
"""
import os
from typing import List

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

MAX_BATCH = 32
MAX_CHARS = 1000

app = FastAPI(title="Let's Yap toxicity service")
_model = None


def get_model():
    global _model
    if _model is None:
        from detoxify import Detoxify  # imported lazily so /health works instantly

        _model = Detoxify("multilingual")
    return _model


class ScoreRequest(BaseModel):
    texts: List[str] = Field(..., max_length=MAX_BATCH)


@app.on_event("startup")
def warm_up():
    get_model().predict(["warm up"])


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/score")
def score(req: ScoreRequest, x_api_key: str = Header(default="")):
    expected = os.environ.get("ML_SERVICE_KEY", "")
    if expected and x_api_key != expected:
        raise HTTPException(status_code=401, detail="bad api key")

    texts = [t[:MAX_CHARS] for t in req.texts]
    if not texts:
        return {"scores": []}

    preds = get_model().predict(texts)  # dict: label -> list[float]
    labels = list(preds.keys())
    scores = [
        {label: float(preds[label][i]) for label in labels} for i in range(len(texts))
    ]
    return {"scores": scores}
