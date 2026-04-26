from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .audit import run_audit


app = FastAPI(
    title="FairLens API",
    description="Fairness auditing, explainability, and mitigation service for high-stakes AI decisions.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "fairlens-api"}


@app.get("/api/audit")
def audit(
    protected_attribute: Literal["sex", "race"] = Query(
        "sex", description="Protected attribute to audit."
    ),
    force_refresh: bool = Query(False, description="Recompute instead of using the cache."),
) -> dict:
    try:
        return run_audit(protected_attribute=protected_attribute, force_refresh=force_refresh)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
