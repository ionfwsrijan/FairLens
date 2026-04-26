from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .audit import CACHE_DIR


REVIEWS_PATH = CACHE_DIR / "reviews.json"
RUNS_PATH = CACHE_DIR / "audit_runs.json"


def append_audit_run(protected_attribute: str, audit: dict[str, Any], dataset: str = "adult") -> None:
    runs = read_json_list(RUNS_PATH)
    runs.append(
        {
            "id": f"run-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{dataset}-{protected_attribute}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "dataset": dataset,
            "protected_attribute": protected_attribute,
            "accuracy": audit["baseline"]["accuracy"],
            "bias_gap": audit["baseline"]["demographic_parity_difference"],
            "mitigated_bias_gap": audit["mitigated"]["demographic_parity_difference"],
            "risk_level": audit["risk"]["level"],
        }
    )
    write_json_list(RUNS_PATH, runs[-50:])
    firebase_put(f"audit_runs/{safe_key(runs[-1]['id'])}", runs[-1])


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
    firebase_put(f"reviews/{safe_key(str(review.get('case_id', 'unknown')))}", review)
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


def firebase_put(path: str, payload: dict[str, Any]) -> None:
    database_url = os.getenv("FIREBASE_DATABASE_URL", "").rstrip("/")
    if not database_url:
        return
    try:
        endpoint = f"{database_url}/fairlens/{path}.json"
        secret = os.getenv("FIREBASE_DATABASE_SECRET")
        if secret:
            endpoint = f"{endpoint}?auth={urllib.parse.quote(secret)}"
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="PUT",
        )
        with urllib.request.urlopen(request, timeout=8):
            pass
    except Exception:
        # Firebase sync is optional. Local JSON remains the source of truth for free demos.
        return


def safe_key(value: str) -> str:
    return "".join(char if char.isalnum() or char in {"-", "_"} else "-" for char in value)
