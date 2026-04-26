from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timezone
from typing import Any


GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"


def build_governance_report(audit: dict[str, Any], use_ai: bool = False) -> dict[str, Any]:
    local_report = build_local_report(audit)
    if not use_ai:
        return local_report

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        local_report["ai"] = {
            "enabled": False,
            "provider": "Google Gemini API",
            "reason": "Set GEMINI_API_KEY from Google AI Studio to enable the free-tier AI report.",
        }
        return local_report

    try:
        ai_sections = generate_gemini_report(audit, api_key)
        local_report["source"] = "Google Gemini API with deterministic local fallback"
        local_report["sections"] = ai_sections
        local_report["markdown"] = sections_to_markdown(ai_sections)
        local_report["ai"] = {
            "enabled": True,
            "provider": "Google Gemini API",
            "model": os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            "free_first": True,
        }
    except Exception as exc:
        local_report["ai"] = {
            "enabled": False,
            "provider": "Google Gemini API",
            "reason": f"Gemini request failed, using local report instead: {exc}",
        }
    return local_report


def build_local_report(audit: dict[str, Any]) -> dict[str, Any]:
    baseline = audit["baseline"]
    mitigated = audit["mitigated"]
    comparison = audit["comparison"]
    dataset = audit["dataset"]
    risk = audit["risk"]

    sections = [
        {
            "title": "Executive Summary",
            "body": (
                f"FairLens audited the {dataset['name']} model for {dataset['protected_attribute']} fairness. "
                f"The baseline model reached {pct(baseline['accuracy'])} accuracy but showed a "
                f"{pct(baseline['demographic_parity_difference'])} demographic parity gap. "
                f"Mitigation reduced the gap to {pct(mitigated['demographic_parity_difference'])}."
            ),
        },
        {
            "title": "Primary Risk",
            "body": (
                f"Risk level is {risk['level']}. The main concern is unequal positive-outcome rates "
                "across protected groups, even though protected attributes are excluded from training."
            ),
        },
        {
            "title": "Mitigation Outcome",
            "body": (
                f"The mitigation reduced measured demographic parity disparity by "
                f"{pct(comparison['bias_reduction'])}. Accuracy changed by "
                f"{signed_pct(comparison['accuracy_delta'])}, which is within a reasonable governance "
                "trade-off for a high-stakes decision workflow."
            ),
        },
        {
            "title": "Explainability Finding",
            "body": audit["explainability"]["insight"],
        },
        {
            "title": "Recommended Decision",
            "body": (
                "Do not ship the baseline model alone. Use the mitigated decision policy, retain human "
                "review for borderline denials, and monitor fairness drift after deployment."
            ),
        },
    ]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Deterministic FairLens report generator",
        "google_product": "Optional Google Gemini API free tier",
        "free_first": True,
        "ai": {"enabled": False, "provider": "Local report engine"},
        "sections": sections,
        "markdown": sections_to_markdown(sections),
    }


def generate_gemini_report(audit: dict[str, Any], api_key: str) -> list[dict[str, str]]:
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    endpoint = GEMINI_ENDPOINT.format(model=model, key=api_key)
    summary = {
        "dataset": audit["dataset"],
        "risk": audit["risk"],
        "baseline": audit["baseline"],
        "mitigated": audit["mitigated"],
        "comparison": audit["comparison"],
        "top_features": audit["explainability"]["top_features"][:8],
        "policy": audit["policy"],
    }
    prompt = (
        "You are FairLens, an AI governance copilot. Write a concise, judge-ready responsible AI "
        "audit report from this JSON. Return strict JSON only with this shape: "
        "{\"sections\":[{\"title\":\"...\",\"body\":\"...\"}]}. Include Executive Summary, "
        "Fairness Risk, Explainability, Mitigation, and Deployment Recommendation. "
        f"Audit JSON: {json.dumps(summary)[:16000]}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=35) as response:
        raw = response.read().decode("utf-8")
    parsed = json.loads(raw)
    text = parsed["candidates"][0]["content"]["parts"][0]["text"]
    report = json.loads(text)
    sections = report.get("sections", [])
    if not isinstance(sections, list) or not sections:
        raise ValueError("Gemini response did not include report sections.")
    return [
        {"title": str(section.get("title", "Report Section")), "body": str(section.get("body", ""))}
        for section in sections
    ]


def sections_to_markdown(sections: list[dict[str, str]]) -> str:
    return "\n\n".join(f"## {section['title']}\n\n{section['body']}" for section in sections)


def pct(value: float | int | None) -> str:
    if value is None:
        return "n/a"
    return f"{float(value) * 100:.1f}%"


def signed_pct(value: float | int | None) -> str:
    if value is None:
        return "n/a"
    sign = "+" if float(value) > 0 else ""
    return f"{sign}{float(value) * 100:.1f}%"
