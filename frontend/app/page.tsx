"use client";

import { useEffect, useMemo, useState } from "react";

type ProtectedAttribute = "sex" | "race";
type TabKey = "baseline" | "audit" | "mitigation";

type GroupMetric = {
  group: string;
  selection_rate: number | null;
  accuracy: number | null;
  false_positive_rate: number | null;
  false_negative_rate: number | null;
};

type ModelMetrics = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  selection_rate: number;
  demographic_parity_difference: number;
  demographic_parity_ratio: number;
  equalized_odds_difference: number;
  by_group: GroupMetric[];
};

type ShapFeature = {
  feature: string;
  importance: number;
  relative_importance: number;
  proxy_risk: "Low" | "Medium" | "High";
};

type ScorecardItem = {
  label: string;
  before: number;
  after: number;
  direction: "higher_is_better" | "lower_is_better" | "closer_to_one";
};

type AuditResponse = {
  generated_at: string;
  dataset: {
    name: string;
    source: string;
    target: string;
    rows: number;
    training_rows: number;
    calibration_rows: number;
    test_rows: number;
    raw_features: number;
    model_features: number;
    protected_attribute: ProtectedAttribute;
    protected_groups: { group: string; count: number; share: number }[];
    excluded_from_training: string[];
  };
  model: {
    baseline: string;
    mitigation: string;
    positive_outcome: string;
    fairness_position: string;
  };
  baseline: ModelMetrics;
  mitigated: ModelMetrics;
  comparison: {
    accuracy_delta: number;
    bias_gap_delta: number;
    bias_reduction: number;
    scorecard: ScorecardItem[];
  };
  explainability: {
    method: string;
    sample_rows: number;
    top_features: ShapFeature[];
    insight: string;
  };
  risk: {
    level: "Watch" | "Elevated" | "High";
    protected_attribute: ProtectedAttribute;
    baseline_message: string;
    mitigated_message: string;
  };
  cache: {
    hit: boolean;
    path: string;
  };
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const tabs: { key: TabKey; label: string }[] = [
  { key: "baseline", label: "Baseline Model" },
  { key: "audit", label: "FairLens Audit" },
  { key: "mitigation", label: "Mitigation Scorecard" }
];

function percent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${(value * 100).toFixed(digits)}%`;
}

function signedPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

export default function Home() {
  const [protectedAttribute, setProtectedAttribute] = useState<ProtectedAttribute>("sex");
  const [activeTab, setActiveTab] = useState<TabKey>("baseline");
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mitigationVisible, setMitigationVisible] = useState(false);

  useEffect(() => {
    void loadAudit(false);
  }, [protectedAttribute]);

  async function loadAudit(forceRefresh: boolean) {
    setLoading(!data);
    setRefreshing(Boolean(data));
    setError(null);
    setMitigationVisible(false);
    try {
      const response = await fetch(
        `${API_URL}/api/audit?protected_attribute=${protectedAttribute}&force_refresh=${forceRefresh}`
      );
      if (!response.ok) {
        const details = await response.json().catch(() => null);
        throw new Error(details?.detail ?? `API request failed with ${response.status}`);
      }
      const payload = (await response.json()) as AuditResponse;
      setData(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load audit.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const riskClass = data?.risk.level.toLowerCase() ?? "watch";
  const lastRun = useMemo(() => {
    if (!data?.generated_at) return "";
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(data.generated_at));
  }, [data?.generated_at]);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="mark">FL</div>
          <div>
            <p className="eyebrow">Responsible AI audit suite</p>
            <h1>FairLens</h1>
          </div>
        </div>
        <div className="top-actions">
          <div className="segmented" aria-label="Protected attribute">
            <button
              className={protectedAttribute === "sex" ? "active" : ""}
              onClick={() => setProtectedAttribute("sex")}
            >
              Gender
            </button>
            <button
              className={protectedAttribute === "race" ? "active" : ""}
              onClick={() => setProtectedAttribute("race")}
            >
              Race
            </button>
          </div>
          <button className="ghost-button" onClick={() => loadAudit(true)} disabled={refreshing}>
            {refreshing ? "Auditing" : "Re-run audit"}
          </button>
        </div>
      </header>

      {error && (
        <section className="error-panel">
          <strong>Backend unavailable.</strong>
          <span>{error}</span>
        </section>
      )}

      {loading && !data ? (
        <section className="loading-grid">
          <div className="skeleton wide" />
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton tall" />
        </section>
      ) : data ? (
        <>
          <section className="control-room">
            <article className={`risk-panel ${riskClass}`}>
              <div className="panel-heading">
                <p className="eyebrow">Current risk</p>
                <span>{data.risk.level}</span>
              </div>
              <h2>{data.risk.baseline_message}</h2>
              <p>{data.risk.mitigated_message}</p>
            </article>

            <MetricCard
              label="Baseline accuracy"
              value={percent(data.baseline.accuracy)}
              delta="Unmitigated"
            />
            <MetricCard
              label="Baseline parity gap"
              value={percent(data.baseline.demographic_parity_difference)}
              delta="Lower is better"
              tone="danger"
            />
            <MetricCard
              label="Bias reduction"
              value={percent(data.comparison.bias_reduction)}
              delta="After mitigation"
              tone="good"
            />
          </section>

          <section className="context-strip">
            <div>
              <span>{data.dataset.name}</span>
              <strong>{compactNumber(data.dataset.rows)} rows</strong>
            </div>
            <div>
              <span>Protected attribute</span>
              <strong>{data.dataset.protected_attribute}</strong>
            </div>
            <div>
              <span>Training posture</span>
              <strong>{data.dataset.excluded_from_training.join(", ")} excluded</strong>
            </div>
            <div>
              <span>Last run</span>
              <strong>{lastRun}</strong>
            </div>
          </section>

          <nav className="tabs" aria-label="FairLens workflow">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={activeTab === tab.key ? "active" : ""}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === "baseline" && <BaselineTab data={data} />}
          {activeTab === "audit" && <AuditTab data={data} />}
          {activeTab === "mitigation" && (
            <MitigationTab
              data={data}
              visible={mitigationVisible}
              onReveal={() => setMitigationVisible(true)}
            />
          )}
        </>
      ) : null}
    </main>
  );
}

function MetricCard({
  label,
  value,
  delta,
  tone = "neutral"
}: {
  label: string;
  value: string;
  delta: string;
  tone?: "neutral" | "danger" | "good";
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{delta}</span>
    </article>
  );
}

function BaselineTab({ data }: { data: AuditResponse }) {
  return (
    <section className="tab-grid">
      <article className="panel span-7">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Baseline outcome audit</p>
            <h2>Positive-outcome rates by group</h2>
          </div>
          <span className="status-chip danger">Disparity detected</span>
        </div>
        <GroupBars groups={data.baseline.by_group} />
      </article>

      <article className="panel span-5">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Model quality</p>
            <h2>Useful but uneven</h2>
          </div>
        </div>
        <div className="metric-stack">
          <MetricRow label="Accuracy" value={percent(data.baseline.accuracy)} />
          <MetricRow label="Precision" value={percent(data.baseline.precision)} />
          <MetricRow label="Recall" value={percent(data.baseline.recall)} />
          <MetricRow label="F1 score" value={percent(data.baseline.f1)} />
          <MetricRow
            label="Demographic parity gap"
            value={percent(data.baseline.demographic_parity_difference)}
            tone="danger"
          />
          <MetricRow
            label="Disparate impact ratio"
            value={data.baseline.demographic_parity_ratio.toFixed(2)}
            tone={data.baseline.demographic_parity_ratio < 0.8 ? "danger" : "neutral"}
          />
        </div>
      </article>

      <article className="panel span-12 narrative-panel">
        <p className="eyebrow">Decision context</p>
        <h2>{data.model.fairness_position}</h2>
        <p>
          The positive label is <strong>{data.model.positive_outcome}</strong>. Because protected
          columns are excluded from training, the remaining gap is caused by historical patterns and
          correlated features rather than direct use of the protected attribute.
        </p>
      </article>
    </section>
  );
}

function AuditTab({ data }: { data: AuditResponse }) {
  return (
    <section className="tab-grid">
      <article className="panel span-7">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{data.explainability.method}</p>
            <h2>Top decision drivers</h2>
          </div>
          <span className="status-chip">n={data.explainability.sample_rows}</span>
        </div>
        <FeatureBars features={data.explainability.top_features} />
      </article>

      <article className="panel span-5">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Proxy analysis</p>
            <h2>What FairLens flags</h2>
          </div>
        </div>
        <p className="insight-copy">{data.explainability.insight}</p>
        <div className="proxy-list">
          {data.explainability.top_features.slice(0, 7).map((feature) => (
            <div key={feature.feature}>
              <span>{feature.feature}</span>
              <strong className={`risk-pill ${feature.proxy_risk.toLowerCase()}`}>
                {feature.proxy_risk}
              </strong>
            </div>
          ))}
        </div>
      </article>

      <article className="panel span-12 narrative-panel">
        <p className="eyebrow">Audit finding</p>
        <h2>Explainability turns the fairness issue into evidence judges can inspect.</h2>
        <p>
          FairLens aggregates encoded model signals back to human-readable features, so proxy-risk
          categories remain visible even after categorical one-hot encoding.
        </p>
      </article>
    </section>
  );
}

function MitigationTab({
  data,
  visible,
  onReveal
}: {
  data: AuditResponse;
  visible: boolean;
  onReveal: () => void;
}) {
  return (
    <section className="tab-grid">
      <article className="panel span-12 mitigation-hero">
        <div>
          <p className="eyebrow">Fairlearn mitigation</p>
          <h2>{data.model.mitigation}</h2>
          <p>
            The mitigated model optimizes decision thresholds with a demographic-parity constraint
            while keeping the original classifier intact for auditability.
          </p>
        </div>
        <button className="primary-button" onClick={onReveal}>
          {visible ? "Mitigation applied" : "Mitigate bias"}
        </button>
      </article>

      <article className="panel span-6 before-after-card">
        <p className="eyebrow">Before</p>
        <h2>Baseline</h2>
        <MetricRow label="Accuracy" value={percent(data.baseline.accuracy)} />
        <MetricRow label="Parity gap" value={percent(data.baseline.demographic_parity_difference)} tone="danger" />
        <MetricRow label="Equalized odds" value={percent(data.baseline.equalized_odds_difference)} />
        <GroupBars groups={data.baseline.by_group} compact />
      </article>

      <article className={`panel span-6 before-after-card ${visible ? "revealed" : "locked"}`}>
        <p className="eyebrow">After</p>
        <h2>FairLens</h2>
        {visible ? (
          <>
            <MetricRow
              label="Accuracy"
              value={percent(data.mitigated.accuracy)}
              delta={signedPercent(data.comparison.accuracy_delta)}
            />
            <MetricRow
              label="Parity gap"
              value={percent(data.mitigated.demographic_parity_difference)}
              delta={signedPercent(data.comparison.bias_gap_delta)}
              tone="good"
            />
            <MetricRow label="Equalized odds" value={percent(data.mitigated.equalized_odds_difference)} />
            <GroupBars groups={data.mitigated.by_group} compact />
          </>
        ) : (
          <div className="locked-state">
            <span>Ready</span>
            <p>Mitigation result is staged for side-by-side comparison.</p>
          </div>
        )}
      </article>

      {visible && (
        <article className="panel span-12">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Governance scorecard</p>
              <h2>Accuracy trade-off versus fairness gain</h2>
            </div>
            <span className="status-chip good">
              {percent(data.comparison.bias_reduction)} bias reduction
            </span>
          </div>
          <div className="scorecard">
            {data.comparison.scorecard.map((item) => (
              <ScorecardRow key={item.label} item={item} />
            ))}
          </div>
        </article>
      )}
    </section>
  );
}

function GroupBars({ groups, compact = false }: { groups: GroupMetric[]; compact?: boolean }) {
  const max = Math.max(...groups.map((group) => group.selection_rate ?? 0), 0.01);
  return (
    <div className={`bar-list ${compact ? "compact" : ""}`}>
      {groups.map((group) => (
        <div className="bar-row" key={group.group}>
          <div className="bar-label">
            <strong>{group.group}</strong>
            <span>{percent(group.selection_rate)}</span>
          </div>
          <div className="track">
            <div style={{ width: `${(((group.selection_rate ?? 0) / max) * 100).toFixed(2)}%` }} />
          </div>
          {!compact && (
            <div className="group-submetrics">
              <span>Accuracy {percent(group.accuracy)}</span>
              <span>FPR {percent(group.false_positive_rate)}</span>
              <span>FNR {percent(group.false_negative_rate)}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function FeatureBars({ features }: { features: ShapFeature[] }) {
  return (
    <div className="feature-list">
      {features.map((feature) => (
        <div className="feature-row" key={feature.feature}>
          <div className="feature-meta">
            <strong>{feature.feature}</strong>
            <span className={`risk-pill ${feature.proxy_risk.toLowerCase()}`}>
              {feature.proxy_risk}
            </span>
          </div>
          <div className="track feature-track">
            <div style={{ width: `${Math.max(feature.relative_importance * 100, 2).toFixed(2)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricRow({
  label,
  value,
  delta,
  tone = "neutral"
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "neutral" | "danger" | "good";
}) {
  return (
    <div className={`metric-row ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {delta && <em>{delta}</em>}
    </div>
  );
}

function ScorecardRow({ item }: { item: ScorecardItem }) {
  const before = item.label.toLowerCase().includes("ratio")
    ? item.before.toFixed(2)
    : percent(item.before);
  const after = item.label.toLowerCase().includes("ratio") ? item.after.toFixed(2) : percent(item.after);
  const improved =
    item.direction === "higher_is_better"
      ? item.after >= item.before
      : item.direction === "lower_is_better"
        ? item.after <= item.before
        : Math.abs(1 - item.after) <= Math.abs(1 - item.before);

  return (
    <div className="scorecard-row">
      <strong>{item.label}</strong>
      <span>{before}</span>
      <span>{after}</span>
      <em className={improved ? "good" : "watch"}>{improved ? "Improved" : "Trade-off"}</em>
    </div>
  );
}
