from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.audit import CACHE_SCHEMA_VERSION, run_audit
from app.main import WARMUP_COMBINATIONS, WARMUP_ROLES, metadata as backend_metadata, warmup


REQUIRED_TOP_LEVEL_KEYS = {
    "schema_version",
    "generated_at",
    "dataset",
    "model",
    "baseline",
    "mitigated",
    "comparison",
    "explainability",
    "segments",
    "decision_cases",
    "policy",
    "governance",
    "risk",
    "cache",
    "role_context",
}

METRIC_KEYS = {
    "accuracy",
    "precision",
    "recall",
    "f1",
    "selection_rate",
    "demographic_parity_difference",
    "demographic_parity_ratio",
    "equalized_odds_difference",
}


class AuditMatrixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.warmup_result = warmup(False)

    def test_warmup_covers_all_demo_audit_combinations_and_roles(self) -> None:
        expected = {
            (dataset, protected_attribute, role)
            for dataset, protected_attribute in WARMUP_COMBINATIONS
            for role in WARMUP_ROLES
        }
        actual = {
            (item["dataset"], item["protected_attribute"], item["role"])
            for item in self.warmup_result["warmed"]
        }

        self.assertEqual(self.warmup_result["status"], "ready")
        self.assertEqual(self.warmup_result["errors"], [])
        self.assertEqual(self.warmup_result["audit_lenses"], len(WARMUP_COMBINATIONS))
        self.assertEqual(self.warmup_result["roles"], len(WARMUP_ROLES))
        self.assertEqual(self.warmup_result["runs"], len(expected))
        self.assertSetEqual(actual, expected)

    def test_every_audit_combination_returns_complete_payload_for_every_role(self) -> None:
        for dataset, protected_attribute in WARMUP_COMBINATIONS:
            seen_priorities: set[str] = set()
            for role in WARMUP_ROLES:
                with self.subTest(dataset=dataset, protected_attribute=protected_attribute, role=role):
                    payload = run_audit(
                        dataset_key=dataset,
                        protected_attribute=protected_attribute,
                        role=role,
                        force_refresh=False,
                    )

                    self.assertTrue(REQUIRED_TOP_LEVEL_KEYS.issubset(payload.keys()))
                    self.assertEqual(payload["schema_version"], CACHE_SCHEMA_VERSION)
                    self.assertEqual(payload["dataset"]["key"], dataset)
                    self.assertEqual(payload["dataset"]["protected_attribute"], protected_attribute)
                    self.assertIn(protected_attribute, payload["dataset"]["supported_protected_attributes"])
                    self.assertGreater(payload["dataset"]["rows"], 0)
                    self.assertGreaterEqual(payload["dataset"]["model_features"], 1)
                    self.assertGreaterEqual(len(payload["dataset"]["protected_groups"]), 2)

                    self.assert_metric_contract(payload["baseline"])
                    self.assert_metric_contract(payload["mitigated"])

                    self.assertEqual(len(payload["comparison"]["scorecard"]), 4)
                    self.assertGreaterEqual(len(payload["explainability"]["top_features"]), 1)
                    self.assertGreaterEqual(len(payload["segments"]), 1)
                    self.assertGreaterEqual(len(payload["decision_cases"]), 1)
                    self.assertEqual(len(payload["policy"]), 4)
                    self.assertTrue(
                        all(check["status"] in {"Pass", "Review"} for check in payload["policy"])
                    )

                    role_context = payload["role_context"]
                    self.assertEqual(role_context["role"], role)
                    self.assertGreaterEqual(len(role_context["metric_focus"]), 1)
                    self.assertGreaterEqual(len(role_context["recommended_actions"]), 1)
                    self.assertGreaterEqual(len(role_context["dashboard_focus"]), 1)
                    self.assertTrue(role_context["report_emphasis"])
                    seen_priorities.add(role_context["priority"])

            self.assertEqual(
                len(seen_priorities),
                len(WARMUP_ROLES),
                f"{dataset}/{protected_attribute} should expose distinct role priorities.",
            )

    def test_unsupported_dataset_attribute_pair_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            run_audit(dataset_key="adult", protected_attribute="age_group", role="Executive")

        with self.assertRaises(ValueError):
            run_audit(dataset_key="german_credit", protected_attribute="race", role="Executive")

    def test_metadata_exposes_frontend_selection_catalog(self) -> None:
        payload = backend_metadata()
        dataset_map = {item["key"]: item for item in payload["datasets"]}
        role_keys = [item["key"] for item in payload["roles"]]

        self.assertEqual(set(dataset_map), {"adult", "german_credit"})
        self.assertEqual(role_keys, list(WARMUP_ROLES))
        self.assertEqual(
            [item["key"] for item in dataset_map["adult"]["protected_attributes"]],
            ["sex", "race"],
        )
        self.assertEqual(
            [item["key"] for item in dataset_map["german_credit"]["protected_attributes"]],
            ["sex", "age_group"],
        )
        self.assertEqual(dataset_map["adult"]["label"], "Adult Income")
        self.assertEqual(dataset_map["german_credit"]["label"], "German Credit")

    def assert_metric_contract(self, metrics: dict) -> None:
        self.assertTrue(METRIC_KEYS.issubset(metrics.keys()))
        self.assertGreaterEqual(len(metrics["by_group"]), 2)

        for key in METRIC_KEYS:
            value = metrics[key]
            self.assertIsNotNone(value, key)
            self.assertTrue(math.isfinite(value), key)
            self.assertGreaterEqual(value, 0.0, key)
            self.assertLessEqual(value, 1.0, key)

        for group in metrics["by_group"]:
            self.assertTrue(group["group"])
            for key in ("selection_rate", "accuracy", "false_positive_rate", "false_negative_rate"):
                self.assertIsNotNone(group[key], f"{group['group']}:{key}")
                self.assertTrue(math.isfinite(group[key]), f"{group['group']}:{key}")
                self.assertGreaterEqual(group[key], 0.0, f"{group['group']}:{key}")
                self.assertLessEqual(group[key], 1.0, f"{group['group']}:{key}")


if __name__ == "__main__":
    unittest.main()
