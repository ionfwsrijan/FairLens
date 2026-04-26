import os
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .audit import run_audit
from .custom_audit import run_custom_csv_audit
from .reporting import build_governance_report
from .storage import append_audit_run, list_audit_runs, list_reviews, upsert_review


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
        *[origin.strip() for origin in os.getenv("FRONTEND_ORIGINS", "").split(",") if origin.strip()],
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
    dataset: Literal["adult", "german_credit"] = Query("adult", description="Real dataset to audit."),
    protected_attribute: Literal["sex", "race", "age_group"] = Query(
        "sex", description="Protected attribute to audit."
    ),
    force_refresh: bool = Query(False, description="Recompute instead of using the cache."),
) -> dict:
    try:
        result = run_audit(
            protected_attribute=protected_attribute,
            force_refresh=force_refresh,
            dataset_key=dataset,
        )
        if force_refresh:
            append_audit_run(protected_attribute, result, dataset)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/report")
def report(
    dataset: Literal["adult", "german_credit"] = Query("adult"),
    protected_attribute: Literal["sex", "race", "age_group"] = Query("sex"),
    use_ai: bool = Query(False, description="Use Gemini API when GEMINI_API_KEY is configured."),
) -> dict:
    try:
        audit_result = run_audit(
            protected_attribute=protected_attribute,
            force_refresh=False,
            dataset_key=dataset,
        )
        return build_governance_report(audit_result, use_ai=use_ai)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/runs")
def runs() -> dict:
    return {"runs": list_audit_runs()}


@app.get("/api/reviews")
def reviews() -> dict:
    return {"reviews": list_reviews()}


class ReviewPayload(BaseModel):
    case_id: str
    status: str = Field(default="Needs review")
    reviewer: str = Field(default="Demo reviewer")
    note: str = Field(default="")
    decision: str = Field(default="Pending")


@app.post("/api/reviews")
def save_review(payload: ReviewPayload) -> dict:
    return {"review": upsert_review(payload.model_dump())}


class CustomAuditPayload(BaseModel):
    csv_text: str
    protected_attribute: str = "sex"
    prediction_column: str = "prediction"
    actual_column: str = "actual"
    probability_column: str | None = "probability"


@app.post("/api/custom-audit")
def custom_audit(payload: CustomAuditPayload) -> dict:
    try:
        return run_custom_csv_audit(
            csv_text=payload.csv_text,
            protected_attribute=payload.protected_attribute,
            prediction_column=payload.prediction_column,
            actual_column=payload.actual_column,
            probability_column=payload.probability_column,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
