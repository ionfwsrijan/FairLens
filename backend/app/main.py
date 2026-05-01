import os
from time import perf_counter
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .audit import DATASET_CATALOG, SUPPORTED_ROLES, run_audit
from .custom_audit import run_custom_csv_audit
from .reporting import build_governance_report
from .storage import append_audit_run, list_audit_runs, list_reviews, upsert_review


app = FastAPI(
    title="FairLens API",
    description="Fairness auditing, explainability, and mitigation service for high-stakes AI decisions.",
    version="1.0.0",
)

WARMUP_COMBINATIONS: tuple[
    tuple[Literal["adult", "german_credit"], Literal["sex", "race", "age_group"]],
    ...,
] = (
    ("adult", "sex"),
    ("adult", "race"),
    ("german_credit", "sex"),
    ("german_credit", "age_group"),
)

WARMUP_ROLES: tuple[Literal["Executive", "ML Engineer", "Compliance Reviewer", "Auditor"], ...] = (
    "Executive",
    "ML Engineer",
    "Compliance Reviewer",
    "Auditor",
)

ATTRIBUTE_LABELS = {
    "sex": "Gender",
    "race": "Race",
    "age_group": "Age group",
}

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


@app.get("/api/metadata")
def metadata() -> dict:
    return {
        "service": "fairlens-api",
        "datasets": [
            {
                "key": key,
                "label": value["label"],
                "name": value["name"],
                "source": value["source"],
                "target": value["target"],
                "use_case": value["use_case"],
                "positive_label": value["positive_label"],
                "default_protected_attribute": value["protected_attributes"][0],
                "protected_attributes": [
                    {"key": attribute, "label": ATTRIBUTE_LABELS.get(attribute, attribute)}
                    for attribute in value["protected_attributes"]
                ],
            }
            for key, value in DATASET_CATALOG.items()
        ],
        "roles": [{"key": role, "label": role} for role in SUPPORTED_ROLES],
        "warmup_combinations": [
            {"dataset": dataset, "protected_attribute": protected_attribute}
            for dataset, protected_attribute in WARMUP_COMBINATIONS
        ],
    }


@app.get("/api/warmup")
@app.post("/api/warmup")
def warmup(
    force_refresh: bool = Query(
        False,
        description="Recompute the first role for each audit lens before validating cached role-specific payloads.",
    )
) -> dict:
    started = perf_counter()
    warmed: list[dict] = []
    errors: list[dict] = []

    for dataset, protected_attribute in WARMUP_COMBINATIONS:
        for role_index, role in enumerate(WARMUP_ROLES):
            try:
                result = run_audit(
                    protected_attribute=protected_attribute,
                    force_refresh=force_refresh and role_index == 0,
                    dataset_key=dataset,
                    role=role,
                )
                warmed.append(
                    {
                        "dataset": dataset,
                        "protected_attribute": protected_attribute,
                        "role": role,
                        "cache_hit": bool(result.get("cache", {}).get("hit")),
                        "baseline_gap": result["baseline"]["demographic_parity_difference"],
                        "mitigated_gap": result["mitigated"]["demographic_parity_difference"],
                        "accuracy": result["mitigated"]["accuracy"],
                    }
                )
            except Exception as exc:
                errors.append(
                    {
                        "dataset": dataset,
                        "protected_attribute": protected_attribute,
                        "role": role,
                        "error": str(exc),
                    }
                )

    response = {
        "status": "ready" if not errors else "partial",
        "audit_lenses": len(WARMUP_COMBINATIONS),
        "roles": len(WARMUP_ROLES),
        "runs": len(warmed),
        "cache_hits": sum(1 for item in warmed if item["cache_hit"]),
        "computed": sum(1 for item in warmed if not item["cache_hit"]),
        "elapsed_ms": round((perf_counter() - started) * 1000, 2),
        "warmed": warmed,
        "errors": errors,
    }
    if errors:
        raise HTTPException(status_code=500, detail=response)
    return response


@app.get("/api/audit")
def audit(
    dataset: Literal["adult", "german_credit"] = Query("adult", description="Real dataset to audit."),
    protected_attribute: Literal["sex", "race", "age_group"] = Query(
        "sex", description="Protected attribute to audit."
    ),
    role: Literal["Executive", "ML Engineer", "Compliance Reviewer", "Auditor"] = Query(
        "Executive", description="Persona-specific backend lens for recommendations and reporting."
    ),
    force_refresh: bool = Query(False, description="Recompute instead of using the cache."),
    threshold_preset: str | None = Query(None, description="Policy threshold preset used by the dashboard."),
    max_parity_gap: float | None = Query(None, ge=0, le=1, description="Maximum acceptable mitigated parity gap."),
    min_accuracy: float | None = Query(None, ge=0, le=1, description="Minimum acceptable mitigated accuracy."),
    min_disparate_impact: float | None = Query(None, ge=0, le=1, description="Minimum acceptable disparate impact ratio."),
) -> dict:
    try:
        result = run_audit(
            protected_attribute=protected_attribute,
            force_refresh=force_refresh,
            dataset_key=dataset,
            role=role,
        )
        if force_refresh:
            append_audit_run(
                protected_attribute,
                result,
                dataset,
                role=role,
                threshold_preset=threshold_preset,
                thresholds={
                    "max_parity_gap": max_parity_gap,
                    "min_accuracy": min_accuracy,
                    "min_disparate_impact": min_disparate_impact,
                },
            )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/report")
def report(
    dataset: Literal["adult", "german_credit"] = Query("adult"),
    protected_attribute: Literal["sex", "race", "age_group"] = Query("sex"),
    role: Literal["Executive", "ML Engineer", "Compliance Reviewer", "Auditor"] = Query("Executive"),
    use_ai: bool = Query(False, description="Use Gemini API when GEMINI_API_KEY is configured."),
) -> dict:
    try:
        audit_result = run_audit(
            protected_attribute=protected_attribute,
            force_refresh=False,
            dataset_key=dataset,
            role=role,
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
