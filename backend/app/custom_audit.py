from __future__ import annotations

import io
from typing import Any

import numpy as np
import pandas as pd
from fairlearn.metrics import demographic_parity_difference, demographic_parity_ratio

from .audit import compute_metrics, group_counts, safe_float


def run_custom_csv_audit(
    csv_text: str,
    protected_attribute: str,
    prediction_column: str,
    actual_column: str,
    probability_column: str | None = None,
) -> dict[str, Any]:
    frame = pd.read_csv(io.StringIO(csv_text))
    required = [protected_attribute, prediction_column, actual_column]
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise ValueError(f"Missing required column(s): {', '.join(missing)}")

    clean = frame.dropna(subset=required).copy()
    if clean.empty:
        raise ValueError("CSV has no usable rows after dropping missing required values.")

    y_pred = normalize_binary(clean[prediction_column], prediction_column)
    y_true = normalize_binary(clean[actual_column], actual_column)
    sensitive = clean[protected_attribute].astype(str)

    metrics = compute_metrics(y_true, y_pred, sensitive)
    probability_summary = None
    if probability_column and probability_column in clean.columns:
        probabilities = pd.to_numeric(clean[probability_column], errors="coerce").dropna()
        if not probabilities.empty:
            probability_summary = {
                "mean": safe_float(probabilities.mean()),
                "median": safe_float(probabilities.median()),
                "p90": safe_float(probabilities.quantile(0.9)),
            }

    return {
        "dataset": {
            "name": "Uploaded prediction audit",
            "rows": int(len(clean)),
            "columns": list(frame.columns),
            "protected_attribute": protected_attribute,
            "prediction_column": prediction_column,
            "actual_column": actual_column,
            "probability_column": probability_column,
            "protected_groups": group_counts(sensitive),
        },
        "metrics": metrics,
        "probability_summary": probability_summary,
        "risk": {
            "level": risk_level(metrics["demographic_parity_difference"]),
            "message": (
                f"Uploaded predictions show a "
                f"{metrics['demographic_parity_difference'] * 100:.1f}% demographic parity gap."
            ),
        },
        "policy": [
            {
                "name": "Demographic parity gap",
                "target": "<= 5%",
                "value": metrics["demographic_parity_difference"],
                "status": "Pass" if metrics["demographic_parity_difference"] <= 0.05 else "Review",
            },
            {
                "name": "Disparate impact ratio",
                "target": ">= 0.80",
                "value": metrics["demographic_parity_ratio"],
                "status": "Pass" if metrics["demographic_parity_ratio"] >= 0.8 else "Review",
            },
        ],
    }


def normalize_binary(values: pd.Series, column_name: str) -> np.ndarray:
    if pd.api.types.is_numeric_dtype(values):
        parsed = pd.to_numeric(values, errors="coerce")
        unique = set(parsed.dropna().astype(int).unique().tolist())
        if unique.issubset({0, 1}):
            return parsed.fillna(0).astype(int).to_numpy()

    normalized = values.astype(str).str.strip().str.lower()
    positive = normalized.isin({"1", "true", "yes", "approved", "approve", ">50k", "positive"})
    negative = normalized.isin({"0", "false", "no", "denied", "deny", "<=50k", "negative"})
    if not (positive | negative).all():
        raise ValueError(
            f"Column '{column_name}' must be binary. Use values like 1/0, true/false, approved/denied."
        )
    return positive.astype(int).to_numpy()


def risk_level(gap: float) -> str:
    if gap >= 0.2:
        return "High"
    if gap >= 0.1:
        return "Elevated"
    return "Watch"
