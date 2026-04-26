# FairLens

FairLens is a professional fairness-audit product demo for high-stakes AI decisions. It uses the real UCI Adult Income dataset, trains a baseline income classifier, audits protected-group outcomes, explains model behavior, and applies fairness-aware mitigation.

The stack is intentionally more production-grade than a notebook or Streamlit MVP:

- **Frontend:** Next.js, React, TypeScript, responsive dashboard UI
- **Backend:** FastAPI fairness engine
- **ML:** scikit-learn preprocessing and logistic classifier
- **Fairness:** Fairlearn demographic parity and equalized odds metrics, plus ThresholdOptimizer mitigation
- **Explainability:** SHAP for global feature attribution, with a deterministic coefficient fallback if SHAP is unavailable

## Product Flow

1. **Command Center:** executive fairness risk cockpit with policy gate status.
2. **Data Room:** real Adult Income dataset profile, base rates, feature distributions, and data-quality checks.
3. **Audit Workbench:** SHAP-ranked feature drivers, proxy-risk triage, and segment diagnostics.
4. **Decision Review:** representative real held-out records with local explanations for human oversight.
5. **Mitigation Lab:** Fairlearn before/after comparison across accuracy, demographic parity, equalized odds, and group selection rates.
6. **Governance Hub:** model card, review workflow, policy checks, evidence pack, and printable report.

## Quick Start

From the project root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
cd frontend
npm install --legacy-peer-deps
```

Start the backend:

```powershell
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Start the frontend in a second terminal:

```powershell
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On this machine, the dataset cache has already been warmed under `.cache/fairlens/`, so the first demo load should be fast.

## Production Run

Use this when you want to demo the optimized build locally:

```powershell
cd frontend
npm run build
npm run start
```

The frontend runs on `http://localhost:3000`. Its internal API proxy expects the backend at `http://localhost:8000` unless `FAIRLENS_API_URL` is changed.

## Docker Run

If Docker Desktop is available:

```powershell
docker compose up --build
```

Then open `http://localhost:3000`.

## Deployment

### Free-First Deployment

For strict no-paid mode, use:

- **Frontend:** Vercel Hobby plan
- **Backend:** Render Free Web Service
- **Google product:** Gemini API free tier through Google AI Studio, optional via `GEMINI_API_KEY`

This avoids requiring a billing-enabled Google Cloud project for the default demo.

#### Backend on Render Free

Create a Render Web Service from this repo:

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Instance type: `Free`
- Health check path: `/api/health`
- Optional env var: `GEMINI_API_KEY=<your Google AI Studio API key>`

#### Frontend on Vercel Hobby

Create a Vercel project from this repo:

- Root directory: `frontend`
- Install command: `npm install --legacy-peer-deps`
- Build command: `npm run build`
- Environment variable: `FAIRLENS_API_URL=<your Render backend URL>`

### Optional Google Cloud Run Deployment

Cloud Run is still a strong Google Cloud story, but it can require Cloud Billing setup. Use it only if you are comfortable with that. Otherwise, keep the no-paid Vercel + Render path above.

Deploy FairLens as two services:

1. **Backend API service**
   - Root directory: `backend`
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Health check: `/api/health`

2. **Frontend web service**
   - Root directory: `frontend`
   - Build command: `npm ci --legacy-peer-deps && npm run build`
   - Start command: `npm run start`
   - Environment variable: `FAIRLENS_API_URL=<your deployed backend URL>`

Render, Railway, Fly.io, or Google Cloud Run all work well with this split. For Google hackathon demos, Google Cloud Run is the most on-theme option: deploy the backend container first, copy its service URL, then deploy the frontend with `FAIRLENS_API_URL` set to that backend URL.

## Free Google Product Integration

FairLens uses Google in a no-paid way through the optional Gemini API free tier:

1. Create an API key in Google AI Studio.
2. Set `GEMINI_API_KEY` on the backend service.
3. Open the **AI Report** workspace.
4. Click **Try Gemini report**.

If the key is missing or quota is exhausted, FairLens automatically falls back to its local deterministic report generator.

## Data

FairLens uses the Adult Income dataset through `fairlearn.datasets.fetch_adult()`. If that fetch path is unavailable, the backend attempts the canonical UCI dataset URLs. No random or synthetic training data is used.

## Demo Notes

- The model intentionally excludes `sex` and `race` from training. This demonstrates that "fairness through unawareness" is not sufficient because proxy features can still create harmful outcome gaps.
- The protected attribute is used only for auditing and mitigation.
- The backend caches the latest audit result under `.cache/fairlens/` so repeat demos stay fast.
