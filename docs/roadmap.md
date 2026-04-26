# FairLens Roadmap

## Built Now

- Full-stack Responsible AI product shell with Next.js and FastAPI.
- Real UCI Adult Income dataset, no generated training rows.
- Baseline model, protected-group audit, SHAP explainability, Fairlearn mitigation.
- Dataset profiling, slice diagnostics, decision-review queue, policy gates, and governance model card.
- Docker and Cloud Run deployment path.

## Next Product Improvements

1. **Multi-dataset support**
   Add German Credit and COMPAS-style demos with a dataset selector, while keeping each dataset real and historically documented.

2. **Upload-your-model audit**
   Let teams upload predictions/probabilities and protected attributes, then run FairLens without retraining their model.

3. **Exportable compliance report**
   Generate a signed PDF/HTML report containing metrics, charts, model card, mitigation choice, reviewer sign-off, and optional Gemini-written executive summary.

4. **Human review workflow**
   Add case assignment, reviewer notes, decision override reason codes, and audit logs.

5. **Monitoring mode**
   Track fairness drift across real incoming batches, compare to baseline thresholds, and alert when policy gates fail.

6. **Mitigation strategy comparison**
   Compare ThresholdOptimizer, ExponentiatedGradient, and preprocessing techniques in one lab view.

7. **Cloud database persistence**
   Store audit runs, decisions, reviewers, model versions, and evidence artifacts in Postgres.

8. **Authentication and roles**
   Add viewer, reviewer, ML engineer, and compliance admin roles for a realistic enterprise workflow.

## What I Need From You For The Next Leap

- Which deployment target do you want: Google Cloud Run, Vercel plus Render, Railway, or local-only for now?
- Do you want FairLens positioned for hiring/enterprise AI governance, loan fairness, HR screening, or general responsible AI?
- Do you have hackathon submission requirements such as max video length, required Google tech, or judging rubric?
