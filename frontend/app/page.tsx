"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type LandingAudit = {
  dataset: {
    name: string;
    rows: number;
  };
  baseline: {
    accuracy: number;
    demographic_parity_difference: number;
  };
  mitigated: {
    accuracy: number;
    demographic_parity_difference: number;
  };
  risk: {
    level: string;
  };
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function percent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${(value * 100).toFixed(digits)}%`;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

export default function Home() {
  const [data, setData] = useState<LandingAudit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadPreview() {
      try {
        const response = await fetch(`${API_URL}/api/audit?dataset=adult&protected_attribute=sex`);
        if (!response.ok) return;
        const payload = (await response.json()) as LandingAudit;
        if (active) setData(payload);
      } catch {
        if (active) setData(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPreview();

    return () => {
      active = false;
    };
  }, []);

  const proofStats = [
    {
      label: "Real rows audited",
      value: data ? compactNumber(data.dataset.rows) : "48K+",
      note: data ? data.dataset.name : "UCI Adult Income"
    },
    {
      label: "Bias gap found",
      value: data ? percent(data.baseline.demographic_parity_difference) : "Live",
      note: "Demographic parity"
    },
    {
      label: "Mitigated gap",
      value: data ? percent(data.mitigated.demographic_parity_difference) : "Ready",
      note: "Fairlearn reduction"
    }
  ];

  return (
    <main className="landing-shell">
      <nav className="landing-nav glass-panel" aria-label="FairLens introduction">
        <div className="brand-lockup">
          <div className="mark">FL</div>
          <div>
            <p className="eyebrow">Google hackathon build</p>
            <strong>FairLens</strong>
          </div>
        </div>
        <Link className="ghost-button compact-button" href="/dashboard">
          Open dashboard
        </Link>
      </nav>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-kicker">Audit. Explain. Mitigate. Govern.</p>
          <h1>Fair AI decisions, presented like a product judges can trust.</h1>
          <p>
            FairLens turns classic biased datasets into a live responsible-AI command center:
            baseline risk, SHAP explainability, Fairlearn mitigation, human review, monitoring,
            and a governance report in one polished flow.
          </p>
          <div className="landing-actions">
            <Link className="primary-button landing-cta" href="/dashboard">
              Let&apos;s begin
            </Link>
            <span>{loading ? "Preparing live audit" : "Live audit ready"}</span>
          </div>
        </div>

        <div className="lens-showcase glass-panel" aria-label="FairLens live audit preview">
          <div className="lens-header">
            <span />
            <span />
            <span />
          </div>
          <div className="lens-orbit">
            <div className="lens-core">
              <span>FairLens</span>
              <strong>{data ? data.risk.level : "Live"}</strong>
            </div>
          </div>
          <div className="lens-metrics">
            <div>
              <span>Baseline</span>
              <strong>{data ? percent(data.baseline.accuracy) : "Model"}</strong>
            </div>
            <div>
              <span>Mitigated</span>
              <strong>{data ? percent(data.mitigated.accuracy) : "Fair"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-proof">
        {proofStats.map((stat) => (
          <article className="glass-panel proof-card" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <p>{stat.note}</p>
          </article>
        ))}
      </section>

      <section className="landing-flow glass-panel">
        <div>
          <span>01</span>
          <strong>Expose unfair outcomes</strong>
          <p>Measure selection-rate gaps across protected groups using real historical data.</p>
        </div>
        <div>
          <span>02</span>
          <strong>Explain hidden proxies</strong>
          <p>Surface the features driving model behavior and flag high-risk proxy signals.</p>
        </div>
        <div>
          <span>03</span>
          <strong>Ship a governance story</strong>
          <p>Compare before and after mitigation, then package the result for reviewers.</p>
        </div>
      </section>
    </main>
  );
}
