# FairLens Architecture

## Why This Stack

The original Streamlit concept is useful for a quick MVP, but a competitive hackathon submission needs a clearer product boundary:

- **Next.js frontend:** lets the demo feel like a polished responsible-AI dashboard instead of a notebook.
- **FastAPI backend:** keeps model training, fairness metrics, and explainability behind a clean API.
- **Fairlearn:** provides auditable fairness metrics and mitigation primitives.
- **SHAP:** gives judges interpretable evidence about which features drive model behavior.

## Request Flow

1. The frontend calls `GET /api/audit?protected_attribute=sex`.
2. The backend loads the UCI Adult Income dataset.
3. `sex` and `race` are excluded from training features.
4. A baseline logistic model is trained on census features.
5. Fairlearn computes group metrics on the test split.
6. SHAP explains the baseline model and groups one-hot encoded attributions back to raw feature names.
7. Fairlearn ThresholdOptimizer fits a demographic-parity constrained post-processor on the calibration split.
8. The API returns a before/after scorecard to the UI.

## Responsible AI Position

FairLens demonstrates that removing protected attributes from training is not enough. Historical and structural proxy features can still produce unequal positive-outcome rates. The product therefore separates three responsibilities:

- **Prediction:** standard supervised model
- **Audit:** protected-attribute metrics and explainability
- **Mitigation:** fairness-aware post-processing with visible trade-offs
