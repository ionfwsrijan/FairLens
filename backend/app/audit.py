from __future__ import annotations

import json
import math
import os
import socket
import urllib.request
import warnings
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from fairlearn.metrics import (
    MetricFrame,
    demographic_parity_difference,
    demographic_parity_ratio,
    equalized_odds_difference,
    false_negative_rate,
    false_positive_rate,
    selection_rate,
)
from fairlearn.postprocessing import ThresholdOptimizer
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


RANDOM_STATE = 42
SUPPORTED_PROTECTED_ATTRIBUTES = ("sex", "race")
PROTECTED_COLUMNS = ("sex", "race")
POSITIVE_LABEL = ">50K"

ROOT = Path(os.getenv("FAIRLENS_ROOT", Path(__file__).resolve().parents[2])).resolve()
CACHE_DIR = ROOT / ".cache" / "fairlens"

ADULT_COLUMNS = [
    "age",
    "workclass",
    "fnlwgt",
    "education",
    "education-num",
    "marital-status",
    "occupation",
    "relationship",
    "race",
    "sex",
    "capital-gain",
    "capital-loss",
    "hours-per-week",
    "native-country",
    "income",
]

PROXY_RISK_FEATURES = {
    "relationship": "High",
    "marital-status": "High",
    "occupation": "Medium",
    "hours-per-week": "Medium",
    "education": "Medium",
    "education-num": "Medium",
    "capital-gain": "Medium",
    "capital-loss": "Medium",
    "native-country": "Medium",
}


def run_audit(protected_attribute: str = "sex", force_refresh: bool = False) -> dict[str, Any]:
    if protected_attribute not in SUPPORTED_PROTECTED_ATTRIBUTES:
        supported = ", ".join(SUPPORTED_PROTECTED_ATTRIBUTES)
        raise ValueError(f"Unsupported protected attribute '{protected_attribute}'. Use one of: {supported}.")

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"adult_audit_{protected_attribute}.json"
    if cache_path.exists() and not force_refresh:
        with cache_path.open("r", encoding="utf-8") as handle:
            cached = json.load(handle)
        if is_current_cache(cached):
            cached["cache"] = {"hit": True, "path": str(cache_path)}
            return cached

    X_raw, y, source = load_adult_dataset()
    X_raw = clean_adult_features(X_raw)
    y = normalize_target(y)
    X_raw, y = align_non_null_rows(X_raw, y)

    sensitive = X_raw[protected_attribute].astype(str).replace({"?": "Unknown"})
    model_features = X_raw.drop(columns=[column for column in PROTECTED_COLUMNS if column in X_raw.columns])

    X_train, X_temp, y_train, y_temp, A_train, A_temp = train_test_split(
        model_features,
        y,
        sensitive,
        test_size=0.4,
        stratify=y,
        random_state=RANDOM_STATE,
    )
    X_cal, X_test, y_cal, y_test, A_cal, A_test = train_test_split(
        X_temp,
        y_temp,
        A_temp,
        test_size=0.5,
        stratify=y_temp,
        random_state=RANDOM_STATE,
    )

    baseline_model = build_pipeline(model_features)
    baseline_model.fit(X_train, y_train)

    baseline_pred = baseline_model.predict(X_test)
    baseline_proba = baseline_model.predict_proba(X_test)[:, 1]
    baseline_metrics = compute_metrics(y_test, baseline_pred, A_test)

    mitigated_model = ThresholdOptimizer(
        estimator=baseline_model,
        constraints="demographic_parity",
        objective="accuracy_score",
        prefit=True,
        predict_method="predict_proba",
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        mitigated_model.fit(X_cal, y_cal, sensitive_features=A_cal)
        try:
            mitigated_pred = mitigated_model.predict(
                X_test,
                sensitive_features=A_test,
                random_state=RANDOM_STATE,
            )
        except TypeError:
            mitigated_pred = mitigated_model.predict(X_test, sensitive_features=A_test)

    mitigated_metrics = compute_metrics(y_test, mitigated_pred, A_test)
    explainability = build_explainability(baseline_model, X_test)
    segments = build_slice_diagnostics(X_test, y_test, baseline_pred, A_test)
    decision_cases = build_decision_cases(baseline_model, X_test, y_test, A_test, baseline_proba)

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "name": "UCI Adult Income",
            "source": source,
            "target": "Predict whether annual income is greater than $50K",
            "rows": int(len(X_raw)),
            "training_rows": int(len(X_train)),
            "calibration_rows": int(len(X_cal)),
            "test_rows": int(len(X_test)),
            "raw_features": int(X_raw.shape[1]),
            "model_features": int(model_features.shape[1]),
            "protected_attribute": protected_attribute,
            "protected_groups": group_counts(sensitive),
            "excluded_from_training": [column for column in PROTECTED_COLUMNS if column in X_raw.columns],
            "profile": build_dataset_profile(X_raw, y, protected_attribute),
        },
        "model": {
            "baseline": "LogisticRegression with one-hot encoded categorical features and standardized numeric features",
            "mitigation": "Fairlearn ThresholdOptimizer constrained by demographic parity",
            "positive_outcome": POSITIVE_LABEL,
            "fairness_position": "Protected attributes are excluded from training and used only for audit and mitigation.",
        },
        "baseline": baseline_metrics,
        "mitigated": mitigated_metrics,
        "comparison": build_comparison(baseline_metrics, mitigated_metrics),
        "explainability": explainability,
        "segments": segments,
        "decision_cases": decision_cases,
        "policy": build_policy_checks(baseline_metrics, mitigated_metrics),
        "governance": build_governance_package(protected_attribute),
        "risk": build_risk_summary(baseline_metrics, mitigated_metrics, protected_attribute),
        "cache": {"hit": False, "path": str(cache_path)},
    }

    with cache_path.open("w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2)

    return result


def is_current_cache(payload: dict[str, Any]) -> bool:
    return all(
        [
            "profile" in payload.get("dataset", {}),
            "segments" in payload,
            "decision_cases" in payload,
            "policy" in payload,
            "governance" in payload,
        ]
    )


def load_adult_dataset() -> tuple[pd.DataFrame, pd.Series, str]:
    try:
        return load_uci_adult_dataset()
    except Exception as uci_error:
        try:
            return load_fairlearn_adult_dataset()
        except Exception as fairlearn_error:
            raise RuntimeError(
                "Unable to load the Adult Income dataset. Make sure the real UCI Adult files "
                "can be downloaded at least once while online."
            ) from fairlearn_error or uci_error


def load_uci_adult_dataset() -> tuple[pd.DataFrame, pd.Series, str]:
    data_dir = CACHE_DIR / "uci-adult"
    data_dir.mkdir(parents=True, exist_ok=True)

    train_path = ensure_cached_download(
        "https://archive.ics.uci.edu/ml/machine-learning-databases/adult/adult.data",
        data_dir / "adult.data",
    )

    train = pd.read_csv(
        train_path,
        names=ADULT_COLUMNS,
        skipinitialspace=True,
        na_values="?",
    )
    frames = [train]

    test_path = data_dir / "adult.test"
    if test_path.exists() and test_path.stat().st_size > 0:
        frames.append(
            pd.read_csv(
                test_path,
                names=ADULT_COLUMNS,
                skiprows=1,
                skipinitialspace=True,
                na_values="?",
            )
        )

    full = pd.concat(frames, ignore_index=True)
    y = full["income"].astype(str).str.replace(".", "", regex=False).str.strip()
    X = full.drop(columns=["income"])
    return X, y, "UCI Machine Learning Repository"


def ensure_cached_download(url: str, path: Path) -> Path:
    if path.exists() and path.stat().st_size > 0:
        return path

    request = urllib.request.Request(
        url,
        headers={"User-Agent": "FairLens/1.0 responsible-ai-demo"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        path.write_bytes(response.read())
    return path


def load_fairlearn_adult_dataset() -> tuple[pd.DataFrame, pd.Series, str]:
    dataset_cache = CACHE_DIR / "fairlearn-data"
    dataset_cache.mkdir(parents=True, exist_ok=True)

    from fairlearn.datasets import fetch_adult

    previous_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(45)
    try:
        dataset = fetch_adult(as_frame=True, data_home=str(dataset_cache))
        return dataset.data.copy(), pd.Series(dataset.target).copy(), "fairlearn.datasets.fetch_adult"
    finally:
        socket.setdefaulttimeout(previous_timeout)


def clean_adult_features(X: pd.DataFrame) -> pd.DataFrame:
    X = X.copy()
    for column in X.columns:
        if pd.api.types.is_object_dtype(X[column]) or pd.api.types.is_categorical_dtype(X[column]):
            X[column] = X[column].astype(str).str.strip().replace({"?": np.nan, "nan": np.nan})
    return X


def normalize_target(y: pd.Series) -> pd.Series:
    if pd.api.types.is_bool_dtype(y):
        return y.astype(int)
    if pd.api.types.is_numeric_dtype(y):
        values = set(pd.Series(y).dropna().unique().tolist())
        if values.issubset({0, 1}):
            return y.astype(int)

    normalized = pd.Series(y).astype(str).str.replace(".", "", regex=False).str.strip()
    return normalized.eq(POSITIVE_LABEL).astype(int)


def align_non_null_rows(X: pd.DataFrame, y: pd.Series) -> tuple[pd.DataFrame, pd.Series]:
    combined = X.copy()
    combined["__target__"] = y.values
    combined = combined.dropna(axis=0).reset_index(drop=True)
    clean_y = combined.pop("__target__").astype(int)
    return combined, clean_y


def build_pipeline(X: pd.DataFrame) -> Pipeline:
    numeric_features = X.select_dtypes(include=["number"]).columns.tolist()
    categorical_features = [column for column in X.columns if column not in numeric_features]

    try:
        encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=True)
    except TypeError:
        encoder = OneHotEncoder(handle_unknown="ignore", sparse=True)

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), numeric_features),
            ("cat", encoder, categorical_features),
        ],
        remainder="drop",
    )

    classifier = LogisticRegression(
        solver="liblinear",
        class_weight="balanced",
        max_iter=1200,
        random_state=RANDOM_STATE,
    )

    return Pipeline(steps=[("preprocessor", preprocessor), ("model", classifier)])


def compute_metrics(y_true: pd.Series, y_pred: np.ndarray, sensitive: pd.Series) -> dict[str, Any]:
    y_pred = np.asarray(y_pred).astype(int)
    y_true_array = np.asarray(y_true).astype(int)

    frame = MetricFrame(
        metrics={
            "selection_rate": selection_rate,
            "accuracy": accuracy_score,
            "false_positive_rate": false_positive_rate,
            "false_negative_rate": false_negative_rate,
        },
        y_true=y_true_array,
        y_pred=y_pred,
        sensitive_features=sensitive,
    )

    return {
        "accuracy": safe_float(accuracy_score(y_true_array, y_pred)),
        "precision": safe_float(precision_score(y_true_array, y_pred, zero_division=0)),
        "recall": safe_float(recall_score(y_true_array, y_pred, zero_division=0)),
        "f1": safe_float(f1_score(y_true_array, y_pred, zero_division=0)),
        "selection_rate": safe_float(selection_rate(y_true_array, y_pred)),
        "demographic_parity_difference": safe_float(
            demographic_parity_difference(y_true_array, y_pred, sensitive_features=sensitive)
        ),
        "demographic_parity_ratio": safe_float(
            demographic_parity_ratio(y_true_array, y_pred, sensitive_features=sensitive)
        ),
        "equalized_odds_difference": safe_float(
            equalized_odds_difference(y_true_array, y_pred, sensitive_features=sensitive)
        ),
        "by_group": metric_frame_to_records(frame),
    }


def metric_frame_to_records(frame: MetricFrame) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    by_group = frame.by_group.reset_index()
    group_column = by_group.columns[0]

    for _, row in by_group.iterrows():
        records.append(
            {
                "group": str(row[group_column]),
                "selection_rate": safe_float(row["selection_rate"]),
                "accuracy": safe_float(row["accuracy"]),
                "false_positive_rate": safe_float(row["false_positive_rate"]),
                "false_negative_rate": safe_float(row["false_negative_rate"]),
            }
        )

    return sorted(records, key=lambda item: item["selection_rate"] or 0, reverse=True)


def build_explainability(model: Pipeline, X_test: pd.DataFrame) -> dict[str, Any]:
    sample_size = min(800, len(X_test))
    background_size = min(200, len(X_test))
    sample = X_test.sample(sample_size, random_state=RANDOM_STATE)
    background = X_test.sample(background_size, random_state=RANDOM_STATE + 1)

    preprocessor: ColumnTransformer = model.named_steps["preprocessor"]
    classifier: LogisticRegression = model.named_steps["model"]
    encoded_sample = as_dense(preprocessor.transform(sample))
    encoded_background = as_dense(preprocessor.transform(background))
    feature_names = preprocessor.get_feature_names_out()
    raw_features = list(X_test.columns)

    method = "SHAP LinearExplainer"
    try:
        import shap

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            explainer = shap.LinearExplainer(classifier, encoded_background)
            shap_values = explainer.shap_values(encoded_sample)

        if isinstance(shap_values, list):
            shap_values = shap_values[-1]
        importance = np.abs(np.asarray(shap_values)).mean(axis=0)
    except Exception:
        method = "Coefficient-weighted attribution fallback"
        coefficients = np.abs(classifier.coef_[0])
        importance = np.abs(encoded_sample * coefficients).mean(axis=0)

    grouped = aggregate_importance(feature_names, importance, raw_features)
    top_features = [
        {
            "feature": feature,
            "importance": safe_float(score),
            "proxy_risk": PROXY_RISK_FEATURES.get(feature, "Low"),
        }
        for feature, score in grouped[:12]
    ]

    max_score = max([item["importance"] for item in top_features], default=1) or 1
    for item in top_features:
        item["relative_importance"] = safe_float(item["importance"] / max_score)

    return {
        "method": method,
        "sample_rows": int(sample_size),
        "top_features": top_features,
        "insight": build_explainability_insight(top_features),
    }


def build_dataset_profile(
    X_raw: pd.DataFrame,
    y: pd.Series,
    protected_attribute: str,
) -> dict[str, Any]:
    positive_rate = float(np.mean(y))
    protected_frame = pd.DataFrame(
        {
            "group": X_raw[protected_attribute].astype(str),
            "target": np.asarray(y).astype(int),
        }
    )

    base_rates = []
    for group, frame in protected_frame.groupby("group"):
        base_rates.append(
            {
                "group": str(group),
                "count": int(len(frame)),
                "positive_rate": safe_float(frame["target"].mean()),
                "share": safe_float(len(frame) / len(protected_frame)),
            }
        )

    numeric_features = [
        feature
        for feature in ["age", "education-num", "hours-per-week", "capital-gain", "capital-loss"]
        if feature in X_raw.columns
    ]
    numeric_profile = [
        {
            "feature": feature,
            "mean": safe_float(X_raw[feature].mean()),
            "median": safe_float(X_raw[feature].median()),
            "p90": safe_float(X_raw[feature].quantile(0.9)),
        }
        for feature in numeric_features
    ]

    categorical_profile = []
    for feature in ["workclass", "education", "occupation", "relationship", "native-country"]:
        if feature not in X_raw.columns:
            continue
        counts = X_raw[feature].astype(str).value_counts().head(5)
        categorical_profile.append(
            {
                "feature": feature,
                "top_values": [
                    {
                        "value": str(value),
                        "count": int(count),
                        "share": safe_float(count / len(X_raw)),
                    }
                    for value, count in counts.items()
                ],
            }
        )

    return {
        "positive_rate": safe_float(positive_rate),
        "negative_rate": safe_float(1 - positive_rate),
        "protected_base_rates": sorted(base_rates, key=lambda item: item["positive_rate"] or 0),
        "numeric_profile": numeric_profile,
        "categorical_profile": categorical_profile,
        "data_quality": [
            {"check": "Missing values removed before training", "status": "Pass"},
            {"check": "Protected attributes excluded from model features", "status": "Pass"},
            {"check": "Real historical dataset, no generated rows", "status": "Pass"},
        ],
    }


def build_slice_diagnostics(
    X_test: pd.DataFrame,
    y_true: pd.Series,
    y_pred: np.ndarray,
    sensitive: pd.Series,
) -> list[dict[str, Any]]:
    frame = X_test.copy().reset_index(drop=True)
    frame["__target__"] = np.asarray(y_true).astype(int)
    frame["__pred__"] = np.asarray(y_pred).astype(int)
    frame["__sensitive__"] = pd.Series(sensitive).reset_index(drop=True).astype(str)

    if "age" in frame.columns:
        frame["age_band"] = pd.cut(
            frame["age"],
            bins=[0, 24, 34, 44, 54, 64, 120],
            labels=["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
            include_lowest=True,
        ).astype(str)
    if "hours-per-week" in frame.columns:
        frame["hours_band"] = pd.cut(
            frame["hours-per-week"],
            bins=[0, 29, 39, 40, 49, 120],
            labels=["<30", "30-39", "40", "41-49", "50+"],
            include_lowest=True,
        ).astype(str)

    overall_selection = float(frame["__pred__"].mean())
    diagnostics: list[dict[str, Any]] = []
    slice_columns = [
        column
        for column in ["age_band", "hours_band", "education", "relationship", "occupation"]
        if column in frame.columns
    ]

    for column in slice_columns:
        for value, group_frame in frame.groupby(column, dropna=False):
            if len(group_frame) < 70:
                continue
            selection = float(group_frame["__pred__"].mean())
            actual = float(group_frame["__target__"].mean())
            accuracy = float((group_frame["__pred__"] == group_frame["__target__"]).mean())
            impact = selection - overall_selection
            diagnostics.append(
                {
                    "dimension": column,
                    "segment": str(value),
                    "count": int(len(group_frame)),
                    "selection_rate": safe_float(selection),
                    "actual_positive_rate": safe_float(actual),
                    "accuracy": safe_float(accuracy),
                    "impact": safe_float(impact),
                    "priority": "High" if abs(impact) >= 0.12 else "Medium" if abs(impact) >= 0.06 else "Watch",
                }
            )

    return sorted(diagnostics, key=lambda item: abs(item["impact"] or 0), reverse=True)[:12]


def build_decision_cases(
    model: Pipeline,
    X_test: pd.DataFrame,
    y_true: pd.Series,
    sensitive: pd.Series,
    probabilities: np.ndarray,
) -> list[dict[str, Any]]:
    X_view = X_test.reset_index(drop=True)
    y_values = np.asarray(y_true).astype(int)
    groups = pd.Series(sensitive).reset_index(drop=True).astype(str)
    probabilities = np.asarray(probabilities)
    predictions = (probabilities >= 0.5).astype(int)

    candidate_sets = [
        ("False negative appeal", np.where((predictions == 0) & (y_values == 1))[0], "Highest-risk missed positive outcome"),
        ("False positive review", np.where((predictions == 1) & (y_values == 0))[0], "Approval that audit team should review"),
        ("Borderline denial", np.where(predictions == 0)[0], "Close decision near the operating threshold"),
        ("High-confidence approval", np.where(predictions == 1)[0], "Approved decision with strong model confidence"),
        ("High-confidence denial", np.where(predictions == 0)[0], "Denied decision with strong model confidence"),
    ]

    selected: list[int] = []
    cases: list[dict[str, Any]] = []
    for label, candidates, reason in candidate_sets:
        available = [int(index) for index in candidates if int(index) not in selected]
        if not available:
            continue
        if label == "High-confidence denial":
            index = min(available, key=lambda item: probabilities[item])
        elif label == "High-confidence approval":
            index = max(available, key=lambda item: probabilities[item])
        else:
            index = min(available, key=lambda item: abs(probabilities[item] - 0.5))
        selected.append(index)

        row = X_view.iloc[index]
        cases.append(
            {
                "id": f"FL-{index + 1000}",
                "label": label,
                "review_reason": reason,
                "protected_group": str(groups.iloc[index]),
                "probability": safe_float(probabilities[index]),
                "prediction": "Approved" if predictions[index] == 1 else "Denied",
                "actual_outcome": POSITIVE_LABEL if y_values[index] == 1 else "<=50K",
                "attributes": summarize_case_attributes(row),
                "local_explanation": build_local_explanation(model, row.to_frame().T),
            }
        )

    return cases


def summarize_case_attributes(row: pd.Series) -> list[dict[str, Any]]:
    fields = [
        "age",
        "education",
        "education-num",
        "marital-status",
        "occupation",
        "relationship",
        "hours-per-week",
        "capital-gain",
        "capital-loss",
        "native-country",
    ]
    return [
        {"label": field, "value": clean_json_value(row[field])}
        for field in fields
        if field in row.index
    ]


def build_local_explanation(model: Pipeline, row: pd.DataFrame) -> list[dict[str, Any]]:
    preprocessor: ColumnTransformer = model.named_steps["preprocessor"]
    classifier: LogisticRegression = model.named_steps["model"]
    encoded_row = as_dense(preprocessor.transform(row))[0]
    contributions = encoded_row * classifier.coef_[0]
    feature_names = preprocessor.get_feature_names_out()
    raw_features = list(row.columns)

    totals: defaultdict[str, float] = defaultdict(float)
    raw_features_by_length = sorted(raw_features, key=len, reverse=True)
    for encoded_name, contribution in zip(feature_names, contributions):
        raw_name = decode_raw_feature(str(encoded_name), raw_features_by_length)
        totals[raw_name] += float(contribution)

    ranked = sorted(totals.items(), key=lambda item: abs(item[1]), reverse=True)[:6]
    return [
        {
            "feature": feature,
            "effect": "raises likelihood" if contribution >= 0 else "lowers likelihood",
            "strength": safe_float(abs(contribution)),
        }
        for feature, contribution in ranked
    ]


def aggregate_importance(
    encoded_feature_names: np.ndarray,
    importance: np.ndarray,
    raw_features: list[str],
) -> list[tuple[str, float]]:
    totals: defaultdict[str, float] = defaultdict(float)
    raw_features_by_length = sorted(raw_features, key=len, reverse=True)

    for encoded_name, score in zip(encoded_feature_names, importance):
        raw_name = decode_raw_feature(str(encoded_name), raw_features_by_length)
        totals[raw_name] += float(score)

    return sorted(totals.items(), key=lambda item: item[1], reverse=True)


def decode_raw_feature(encoded_name: str, raw_features: list[str]) -> str:
    if "__" in encoded_name:
        _, tail = encoded_name.split("__", 1)
    else:
        tail = encoded_name

    for feature in raw_features:
        if tail == feature or tail.startswith(f"{feature}_"):
            return feature
    return tail.rsplit("_", 1)[0]


def build_explainability_insight(top_features: list[dict[str, Any]]) -> str:
    risky = [item["feature"] for item in top_features if item["proxy_risk"] in {"High", "Medium"}]
    if risky:
        return (
            "The strongest signals include proxy-risk fields such as "
            f"{', '.join(risky[:4])}. FairLens flags these because they can encode structural "
            "labor-market and household patterns even when protected attributes are removed."
        )
    return "The strongest signals are mostly low-risk direct economic features in this run."


def build_comparison(baseline: dict[str, Any], mitigated: dict[str, Any]) -> dict[str, Any]:
    accuracy_delta = mitigated["accuracy"] - baseline["accuracy"]
    bias_delta = mitigated["demographic_parity_difference"] - baseline["demographic_parity_difference"]
    bias_reduction = 0.0
    if baseline["demographic_parity_difference"]:
        bias_reduction = 1 - (
            mitigated["demographic_parity_difference"] / baseline["demographic_parity_difference"]
        )

    return {
        "accuracy_delta": safe_float(accuracy_delta),
        "bias_gap_delta": safe_float(bias_delta),
        "bias_reduction": safe_float(max(min(bias_reduction, 1), -1)),
        "scorecard": [
            {
                "label": "Accuracy",
                "before": baseline["accuracy"],
                "after": mitigated["accuracy"],
                "direction": "higher_is_better",
            },
            {
                "label": "Demographic parity gap",
                "before": baseline["demographic_parity_difference"],
                "after": mitigated["demographic_parity_difference"],
                "direction": "lower_is_better",
            },
            {
                "label": "Equalized odds gap",
                "before": baseline["equalized_odds_difference"],
                "after": mitigated["equalized_odds_difference"],
                "direction": "lower_is_better",
            },
            {
                "label": "Disparate impact ratio",
                "before": baseline["demographic_parity_ratio"],
                "after": mitigated["demographic_parity_ratio"],
                "direction": "closer_to_one",
            },
        ],
    }


def build_risk_summary(
    baseline: dict[str, Any],
    mitigated: dict[str, Any],
    protected_attribute: str,
) -> dict[str, Any]:
    gap = baseline["demographic_parity_difference"]
    after_gap = mitigated["demographic_parity_difference"]

    if gap >= 0.2:
        level = "High"
    elif gap >= 0.1:
        level = "Elevated"
    else:
        level = "Watch"

    return {
        "level": level,
        "protected_attribute": protected_attribute,
        "baseline_message": (
            f"The baseline model has a {gap * 100:.1f}% demographic parity gap across "
            f"{protected_attribute} groups."
        ),
        "mitigated_message": (
            f"Mitigation reduces the measured gap to {after_gap * 100:.1f}% while preserving "
            f"{mitigated['accuracy'] * 100:.1f}% accuracy."
        ),
    }


def build_policy_checks(baseline: dict[str, Any], mitigated: dict[str, Any]) -> list[dict[str, Any]]:
    checks = [
        {
            "name": "Demographic parity gap",
            "target": "<= 5%",
            "baseline": baseline["demographic_parity_difference"],
            "mitigated": mitigated["demographic_parity_difference"],
            "status": "Pass" if mitigated["demographic_parity_difference"] <= 0.05 else "Review",
            "owner": "Fairness reviewer",
        },
        {
            "name": "Disparate impact ratio",
            "target": ">= 0.80",
            "baseline": baseline["demographic_parity_ratio"],
            "mitigated": mitigated["demographic_parity_ratio"],
            "status": "Pass" if mitigated["demographic_parity_ratio"] >= 0.8 else "Review",
            "owner": "Compliance lead",
        },
        {
            "name": "Equalized odds gap",
            "target": "<= 10%",
            "baseline": baseline["equalized_odds_difference"],
            "mitigated": mitigated["equalized_odds_difference"],
            "status": "Pass" if mitigated["equalized_odds_difference"] <= 0.1 else "Review",
            "owner": "ML lead",
        },
        {
            "name": "Accuracy preservation",
            "target": "Drop no worse than 5%",
            "baseline": baseline["accuracy"],
            "mitigated": mitigated["accuracy"],
            "status": "Pass" if mitigated["accuracy"] >= baseline["accuracy"] - 0.05 else "Review",
            "owner": "Product owner",
        },
    ]
    return checks


def build_governance_package(protected_attribute: str) -> dict[str, Any]:
    return {
        "model_card": [
            {"label": "Use case", "value": "Income eligibility risk screening on Adult census records"},
            {"label": "Dataset", "value": "UCI Adult Income, real historical census-derived records"},
            {"label": "Protected audit field", "value": protected_attribute},
            {"label": "Mitigation method", "value": "Fairlearn ThresholdOptimizer with demographic parity constraint"},
            {"label": "Human oversight", "value": "Required for all borderline denials and policy check failures"},
        ],
        "review_workflow": [
            {"step": "Dataset intake", "status": "Complete", "owner": "Data steward"},
            {"step": "Baseline fairness audit", "status": "Complete", "owner": "ML engineer"},
            {"step": "Proxy feature review", "status": "Ready", "owner": "Policy analyst"},
            {"step": "Mitigation sign-off", "status": "Ready", "owner": "Risk committee"},
            {"step": "Production monitoring plan", "status": "Draft", "owner": "Responsible AI lead"},
        ],
        "evidence_pack": [
            "Group-level selection rates",
            "Demographic parity and equalized odds metrics",
            "SHAP-ranked proxy feature analysis",
            "Before/after mitigation scorecard",
            "Case-level decision review queue",
        ],
    }


def group_counts(values: pd.Series) -> list[dict[str, Any]]:
    counts = values.value_counts(dropna=False)
    total = int(counts.sum())
    return [
        {
            "group": str(group),
            "count": int(count),
            "share": safe_float(count / total if total else 0),
        }
        for group, count in counts.items()
    ]


def as_dense(matrix: Any) -> np.ndarray:
    if hasattr(matrix, "toarray"):
        return matrix.toarray()
    return np.asarray(matrix)


def clean_json_value(value: Any) -> str | int | float | None:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return safe_float(value)
    return str(value)


def safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(parsed) or math.isinf(parsed):
        return None
    return parsed
