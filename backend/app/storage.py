from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .audit import CACHE_DIR


REVIEWS_PATH = CACHE_DIR / "reviews.json"
RUNS_PATH = CACHE_DIR / "audit_runs.json"


def append_audit_run(protected_attribute: str, audit: dict[str, Any]) -> None:
    runs = read_json_list(RUNS_PATH)
    runs.append(
        {
            "id": f"run-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{protected_attribute}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "protected_attribute": protected_attribute,
            "accuracy": audit["baseline"]["accuracy"],
            "bias_gap": audit["baseline"]["demographic_parity_difference"],
            "mitigated_bias_gap": audit["mitigated"]["demographic_parity_difference"],
            "risk_level": audit["risk"]["level"],
        }
    )
    write_json_list(RUNS_PATH, runs[-50:])


def list_audit_runs() -> list[dict[str, Any]]:
    return read_json_list(RUNS_PATH)


def upsert_review(review: dict[str, Any]) -> dict[str, Any]:
    reviews = read_json_list(REVIEWS_PATH)
    review = {
        **review,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    existing_index = next(
        (index for index, item in enumerate(reviews) if item.get("case_id") == review.get("case_id")),
        None,
    )
    if existing_index is None:
        review["created_at"] = review["updated_at"]
        reviews.append(review)
    else:
        reviews[existing_index] = {**reviews[existing_index], **review}
    write_json_list(REVIEWS_PATH, reviews)
    return review


def list_reviews() -> list[dict[str, Any]]:
    return read_json_list(REVIEWS_PATH)


def read_json_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload if isinstance(payload, list) else []


def write_json_list(path: Path, payload: list[dict[str, Any]]) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
