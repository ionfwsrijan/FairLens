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
CACHE_SCHEMA_VERSION = 2
SUPPORTED_DATASETS = ("adult", "german_credit")
SUPPORTED_PROTECTED_ATTRIBUTES = ("sex", "race", "age_group")
SUPPORTED_ROLES = ("Executive", "ML Engineer", "Compliance Reviewer", "Auditor")
ADULT_PROTECTED_COLUMNS = ("sex", "race")
GERMAN_PROTECTED_COLUMNS = ("sex", "age_group", "personal_status_sex")
ADULT_POSITIVE_LABEL = ">50K"
GERMAN_POSITIVE_LABEL = "Good credit risk"

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

GERMAN_CREDIT_COLUMNS = [
    "checking_status",
    "duration_months",
    "credit_history",
    "purpose",
    "credit_amount",
    "savings_status",
    "employment_since",
    "installment_rate",
    "personal_status_sex",
    "other_debtors",
    "residence_since",
    "property",
    "age",
    "other_installment_plans",
    "housing",
    "existing_credits",
    "job",
    "people_liable",
    "telephone",
    "foreign_worker",
    "credit_risk",
]

DATASET_CATALOG: dict[str, dict[str, Any]] = {
    "adult": {
        "name": "UCI Adult Income",
        "label": "Adult Income",
        "target": "Predict whether annual income is greater than $50K",
        "positive_label": ADULT_POSITIVE_LABEL,
        "protected_attributes": ["sex", "race"],
        "protected_exclusions": list(ADULT_PROTECTED_COLUMNS),
        "use_case": "Income eligibility risk screening",
        "source": "UCI Machine Learning Repository",
    },
    "german_credit": {
        "name": "Statlog German Credit",
        "label": "German Credit",
        "target": "Predict whether a credit applicant is a good credit risk",
        "positive_label": GERMAN_POSITIVE_LABEL,
        "protected_attributes": ["sex", "age_group"],
        "protected_exclusions": list(GERMAN_PROTECTED_COLUMNS),
        "use_case": "Credit risk screening",
        "source": "UCI Machine Learning Repository",
    },
}

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


def run_audit(
    protected_attribute: str = "sex",
    force_refresh: bool = False,
    dataset_key: str = "adult",
    role: str = "Executive",
) -> dict[str, Any]:
    if dataset_key not in SUPPORTED_DATASETS:
        supported = ", ".join(SUPPORTED_DATASETS)
        raise ValueError(f"Unsupported dataset '{dataset_key}'. Use one of: {supported}.")
    if role not in SUPPORTED_ROLES:
        supported = ", ".join(SUPPORTED_ROLES)
        raise ValueError(f"Unsupported role '{role}'. Use one of: {supported}.")

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{dataset_key}_audit_{protected_attribute}.json"
    if cache_path.exists() and not force_refresh:
        with cache_path.open("r", encoding="utf-8") as handle:
            cached = json.load(handle)
        if is_current_cache(cached):
            cached["cache"] = {"hit": True, "path": str(cache_path)}
            return attach_role_context(cached, role)

    X_raw, y, source, metadata = load_dataset(dataset_key)
    if protected_attribute not in metadata["protected_attributes"]:
        supported = ", ".join(metadata["protected_attributes"])
        raise ValueError(
            f"Unsupported protected attribute '{protected_attribute}' for {metadata['name']}. "
            f"Use one of: {supported}."
        )
    X_raw = clean_adult_features(X_raw)
    X_raw, y = align_non_null_rows(X_raw, y)

    sensitive = X_raw[protected_attribute].astype(str).replace({"?": "Unknown"})
    model_features = X_raw.drop(
        columns=[column for column in metadata["protected_exclusions"] if column in X_raw.columns]
    )

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
    decision_cases = build_decision_cases(
        baseline_model,
        X_test,
        y_test,
        A_test,
        baseline_proba,
        positive_label=metadata["positive_label"],
    )

    result = {
        "schema_version": CACHE_SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "key": dataset_key,
            "name": metadata["name"],
            "source": source,
            "target": metadata["target"],
            "rows": int(len(X_raw)),
            "training_rows": int(len(X_train)),
            "calibration_rows": int(len(X_cal)),
            "test_rows": int(len(X_test)),
            "raw_features": int(X_raw.shape[1]),
            "model_features": int(model_features.shape[1]),
            "protected_attribute": protected_attribute,
            "supported_protected_attributes": metadata["protected_attributes"],
            "protected_groups": group_counts(sensitive),
            "excluded_from_training": [
                column for column in metadata["protected_exclusions"] if column in X_raw.columns
            ],
            "profile": build_dataset_profile(X_raw, y, protected_attribute),
        },
        "model": {
            "baseline": "LogisticRegression with one-hot encoded categorical features and standardized numeric features",
            "mitigation": "Fairlearn ThresholdOptimizer constrained by demographic parity",
            "positive_outcome": metadata["positive_label"],
            "fairness_position": "Protected attributes are excluded from training and used only for audit and mitigation.",
        },
        "baseline": baseline_metrics,
        "mitigated": mitigated_metrics,
        "comparison": build_comparison(baseline_metrics, mitigated_metrics),
        "explainability": explainability,
        "segments": segments,
        "decision_cases": decision_cases,
        "policy": build_policy_checks(baseline_metrics, mitigated_metrics),
        "governance": build_governance_package(protected_attribute, metadata),
        "risk": build_risk_summary(baseline_metrics, mitigated_metrics, protected_attribute),
        "cache": {"hit": False, "path": str(cache_path)},
    }

    with cache_path.open("w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2)

    return attach_role_context(result, role)


def is_current_cache(payload: dict[str, Any]) -> bool:
    return all(
        [
            "profile" in payload.get("dataset", {}),
            payload.get("schema_version") == CACHE_SCHEMA_VERSION,
            "key" in payload.get("dataset", {}),
            "supported_protected_attributes" in payload.get("dataset", {}),
            "baseline" in payload,
            "mitigated" in payload,
            "comparison" in payload,
            "explainability" in payload,
            "segments" in payload,
            "decision_cases" in payload,
            "policy" in payload,
            "governance" in payload,
            "risk" in payload,
        ]
    )


def attach_role_context(payload: dict[str, Any], role: str) -> dict[str, Any]:
    result = dict(payload)
    result["role_context"] = build_role_context(result, role)
    return result


def build_role_context(audit: dict[str, Any], role: str) -> dict[str, Any]:
    baseline = audit["baseline"]
    mitigated = audit["mitigated"]
    comparison = audit["comparison"]
    policy = audit["policy"]
    risk = audit["risk"]
    explainability = audit["explainability"]
    dataset = audit["dataset"]

    policy_total = max(len(policy), 1)
    policy_passed = sum(1 for check in policy if check["status"] == "Pass")
    top_feature = explainability["top_features"][0]["feature"] if explainability["top_features"] else "No dominant proxy"
    protected_group_count = len(dataset.get("protected_groups", []))

    metric_catalog = {
        "risk_level": {
            "label": "Risk level",
            "value": risk["level"],
            "format": "text",
            "rationale": "The fastest signal for whether this model needs executive or compliance attention.",
        },
        "baseline_accuracy": {
            "label": "Baseline accuracy",
            "value": baseline["accuracy"],
            "format": "percent",
            "rationale": "Shows raw model utility before fairness intervention.",
        },
        "mitigated_accuracy": {
            "label": "Mitigated accuracy",
            "value": mitigated["accuracy"],
            "format": "percent",
            "rationale": "Shows production utility after the fairness constraint is applied.",
        },
        "accuracy_delta": {
            "label": "Accuracy trade-off",
            "value": comparison["accuracy_delta"],
            "format": "signed_percent",
            "rationale": "Quantifies the business cost of mitigation.",
        },
        "parity_gap": {
            "label": "Parity gap",
            "value": baseline["demographic_parity_difference"],
            "format": "percent",
            "rationale": "Measures the baseline disparity across the selected protected groups.",
        },
        "mitigated_gap": {
            "label": "Mitigated gap",
            "value": mitigated["demographic_parity_difference"],
            "format": "percent",
            "rationale": "Measures remaining disparity after mitigation.",
        },
        "bias_reduction": {
            "label": "Bias reduction",
            "value": comparison["bias_reduction"],
            "format": "percent",
            "rationale": "Shows how much disparity FairLens removed.",
        },
        "disparate_impact": {
            "label": "Disparate impact ratio",
            "value": mitigated["demographic_parity_ratio"],
            "format": "ratio",
            "rationale": "A compliance-friendly ratio for adverse impact review.",
        },
        "equalized_odds": {
            "label": "Equalized odds gap",
            "value": baseline["equalized_odds_difference"],
            "format": "percent",
            "rationale": "Highlights whether error rates differ across groups.",
        },
        "policy_readiness": {
            "label": "Policy gates passing",
            "value": policy_passed / policy_total,
            "format": "percent",
            "rationale": f"{policy_passed} of {policy_total} deployment controls currently pass.",
        },
        "top_proxy": {
            "label": "Top proxy feature",
            "value": top_feature,
            "format": "text",
            "rationale": "The first feature to inspect when explaining proxy risk.",
        },
        "protected_groups": {
            "label": "Protected groups audited",
            "value": protected_group_count,
            "format": "count",
            "rationale": "Defines the audit coverage for this role's review.",
        },
    }

    role_playbook = {
        "Executive": {
            "priority": "Ship readiness and business risk",
            "decision_question": "Can leadership defend the accuracy trade-off and approve the mitigated workflow?",
            "metric_keys": ["risk_level", "baseline_accuracy", "bias_reduction", "accuracy_delta"],
            "recommended_actions": [
                "Present the mitigated model as the deployment candidate, not the baseline model.",
                "Frame the accuracy trade-off against the measured reduction in protected-group disparity.",
                "Keep human review active for borderline denials before any production launch.",
            ],
            "dashboard_focus": ["Command Center", "Mitigation Lab", "AI Report"],
            "report_emphasis": "Board-ready fairness posture, business trade-off, and deployment decision.",
        },
        "ML Engineer": {
            "priority": "Model behavior, proxies, and monitoring",
            "decision_question": "Which features, slices, and error gaps need engineering work before release?",
            "metric_keys": ["baseline_accuracy", "equalized_odds", "top_proxy", "mitigated_gap"],
            "recommended_actions": [
                "Inspect high-importance proxy features and test feature-removal or monotonic constraints.",
                "Compare baseline and mitigated error rates across protected groups.",
                "Add fairness drift monitoring for the segments with the largest approval-rate shifts.",
            ],
            "dashboard_focus": ["Audit Workbench", "Data Room", "Monitoring"],
            "report_emphasis": "Feature-level diagnostics, error-rate behavior, and retraining hooks.",
        },
        "Compliance Reviewer": {
            "priority": "Policy gates and defensible evidence",
            "decision_question": "Does the mitigated model satisfy adverse-impact and governance review requirements?",
            "metric_keys": ["disparate_impact", "policy_readiness", "mitigated_gap", "protected_groups"],
            "recommended_actions": [
                "Attach the model card, policy gates, and fairness scorecard to the review record.",
                "Require sign-off for any policy gate marked Review.",
                "Document why protected attributes are excluded from training and retained for audit only.",
            ],
            "dashboard_focus": ["Governance", "Decision Review", "AI Report"],
            "report_emphasis": "Evidence pack, adverse-impact language, and reviewer sign-off path.",
        },
        "Auditor": {
            "priority": "Traceability and repeatable audit evidence",
            "decision_question": "Can an independent reviewer reproduce the fairness finding from real data?",
            "metric_keys": ["protected_groups", "parity_gap", "mitigated_gap", "policy_readiness"],
            "recommended_actions": [
                "Verify dataset source, row counts, protected-group counts, and cache path.",
                "Review representative decision cases for each protected group.",
                "Export the report and retain the audit timestamp for submission evidence.",
            ],
            "dashboard_focus": ["Data Room", "Decision Review", "Governance"],
            "report_emphasis": "Dataset provenance, repeatability, and audit trail completeness.",
        },
    }

    playbook = role_playbook[role]
    return {
        "role": role,
        "priority": playbook["priority"],
        "decision_question": playbook["decision_question"],
        "summary": (
            f"{role} mode emphasizes {playbook['priority'].lower()} for the "
            f"{dataset['name']} audit across {dataset['protected_attribute']} groups."
        ),
        "metric_focus": [metric_catalog[key] for key in playbook["metric_keys"]],
        "recommended_actions": playbook["recommended_actions"],
        "dashboard_focus": playbook["dashboard_focus"],
        "report_emphasis": playbook["report_emphasis"],
    }


def load_dataset(dataset_key: str) -> tuple[pd.DataFrame, pd.Series, str, dict[str, Any]]:
    if dataset_key == "adult":
        X, y, source = load_adult_dataset()
        return X, normalize_adult_target(y), source, dataset_catalog_entry(dataset_key)
    if dataset_key == "german_credit":
        X, y, source = load_german_credit_dataset()
        return X, y, source, dataset_catalog_entry(dataset_key)
    raise ValueError(f"Unsupported dataset '{dataset_key}'.")


def dataset_catalog_entry(dataset_key: str) -> dict[str, Any]:
    entry = dict(DATASET_CATALOG[dataset_key])
    entry["protected_attributes"] = list(entry["protected_attributes"])
    entry["protected_exclusions"] = list(entry["protected_exclusions"])
    return entry


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


def load_german_credit_dataset() -> tuple[pd.DataFrame, pd.Series, str]:
    data_dir = CACHE_DIR / "german-credit"
    data_dir.mkdir(parents=True, exist_ok=True)
    data_path = ensure_cached_download(
        "https://archive.ics.uci.edu/ml/machine-learning-databases/statlog/german/german.data",
        data_dir / "german.data",
    )
    frame = pd.read_csv(
        data_path,
        names=GERMAN_CREDIT_COLUMNS,
        sep=r"\s+",
        engine="python",
    )
    frame["sex"] = frame["personal_status_sex"].map(
        {
            "A91": "Male",
            "A92": "Female",
            "A93": "Male",
            "A94": "Male",
            "A95": "Female/Unknown",
        }
    ).fillna("Unknown")
    frame["age_group"] = np.where(frame["age"] >= 25, "25 and older", "Under 25")
    y = frame["credit_risk"].astype(int).eq(1).astype(int)
    X = frame.drop(columns=["credit_risk"])
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


def normalize_adult_target(y: pd.Series) -> pd.Series:
    if pd.api.types.is_bool_dtype(y):
        return y.astype(int)
    if pd.api.types.is_numeric_dtype(y):
        values = set(pd.Series(y).dropna().unique().tolist())
        if values.issubset({0, 1}):
            return y.astype(int)

    normalized = pd.Series(y).astype(str).str.replace(".", "", regex=False).str.strip()
    return normalized.eq(ADULT_POSITIVE_LABEL).astype(int)


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

    preferred_numeric = [
        "age",
        "education-num",
        "hours-per-week",
        "capital-gain",
        "capital-loss",
        "duration_months",
        "credit_amount",
        "installment_rate",
        "existing_credits",
    ]
    numeric_features = [
        feature
        for feature in preferred_numeric
        if feature in X_raw.select_dtypes(include=["number"]).columns
    ][:6]
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
    preferred_categorical = [
        "workclass",
        "education",
        "occupation",
        "relationship",
        "native-country",
        "checking_status",
        "credit_history",
        "purpose",
        "savings_status",
        "employment_since",
        "housing",
    ]
    for feature in [item for item in preferred_categorical if item in X_raw.columns][:6]:
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
    frame["protected_group"] = frame["__sensitive__"]

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
    if "credit_amount" in frame.columns:
        frame["credit_amount_band"] = pd.qcut(
            frame["credit_amount"],
            q=4,
            duplicates="drop",
        ).astype(str)

    overall_selection = float(frame["__pred__"].mean())
    diagnostics: list[dict[str, Any]] = []
    slice_columns = [
        column
        for column in [
            "protected_group",
            "age_band",
            "hours_band",
            "credit_amount_band",
            "education",
            "relationship",
            "occupation",
            "checking_status",
            "credit_history",
            "purpose",
            "housing",
        ]
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
    positive_label: str,
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
                "actual_outcome": positive_label if y_values[index] == 1 else "Negative outcome",
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
        "duration_months",
        "credit_amount",
        "checking_status",
        "credit_history",
        "purpose",
        "savings_status",
        "employment_since",
        "housing",
        "job",
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


def build_governance_package(protected_attribute: str, metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        "model_card": [
            {"label": "Use case", "value": metadata["use_case"]},
            {"label": "Dataset", "value": f"{metadata['name']}, real historical records"},
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
