"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type ProtectedAttribute = "sex" | "race";
type ViewKey = "command" | "data" | "audit" | "cases" | "mitigation" | "governance";

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

type SegmentDiagnostic = {
  dimension: string;
  segment: string;
  count: number;
  selection_rate: number | null;
  actual_positive_rate: number | null;
  accuracy: number | null;
  impact: number | null;
  priority: "High" | "Medium" | "Watch";
};

type DecisionCase = {
  id: string;
  label: string;
  review_reason: string;
  protected_group: string;
  probability: number | null;
  prediction: "Approved" | "Denied";
  actual_outcome: string;
  attributes: { label: string; value: string | number | null }[];
  local_explanation: { feature: string; effect: string; strength: number | null }[];
};

type ScorecardItem = {
  label: string;
  before: number;
  after: number;
  direction: "higher_is_better" | "lower_is_better" | "closer_to_one";
};

type PolicyCheck = {
  name: string;
  target: string;
  baseline: number;
  mitigated: number;
  status: "Pass" | "Review";
  owner: string;
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
    profile: {
      positive_rate: number;
      negative_rate: number;
      protected_base_rates: {
        group: string;
        count: number;
        positive_rate: number | null;
        share: number | null;
      }[];
      numeric_profile: {
        feature: string;
        mean: number | null;
        median: number | null;
        p90: number | null;
      }[];
      categorical_profile: {
        feature: string;
        top_values: { value: string; count: number; share: number | null }[];
      }[];
      data_quality: { check: string; status: "Pass" }[];
    };
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
  segments: SegmentDiagnostic[];
  decision_cases: DecisionCase[];
  policy: PolicyCheck[];
  governance: {
    model_card: { label: string; value: string }[];
    review_workflow: { step: string; status: string; owner: string }[];
    evidence_pack: string[];
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const views: { key: ViewKey; label: string; kicker: string }[] = [
  { key: "command", label: "Command Center", kicker: "Executive view" },
  { key: "data", label: "Data Room", kicker: "Dataset evidence" },
  { key: "audit", label: "Audit Workbench", kicker: "Bias and proxies" },
  { key: "cases", label: "Decision Review", kicker: "Human oversight" },
  { key: "mitigation", label: "Mitigation Lab", kicker: "Before and after" },
  { key: "governance", label: "Governance", kicker: "Model card" }
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

function number(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return value.toFixed(digits);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

export default function Home() {
  const [protectedAttribute, setProtectedAttribute] = useState<ProtectedAttribute>("sex");
  const [activeView, setActiveView] = useState<ViewKey>("command");
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mitigationVisible, setMitigationVisible] = useState(true);
  const [selectedCase, setSelectedCase] = useState(0);

  useEffect(() => {
    void loadAudit(false);
  }, [protectedAttribute]);

  async function loadAudit(forceRefresh: boolean) {
    setLoading(!data);
    setRefreshing(Boolean(data));
    setError(null);
    setSelectedCase(0);
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
    <main className="shell app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="mark">FL</div>
          <div>
            <p className="eyebrow">Responsible AI suite</p>
            <h1>FairLens</h1>
          </div>
        </div>

        <nav className="workspace-nav" aria-label="FairLens workspaces">
          {views.map((view) => (
            <button
              key={view.key}
              className={activeView === view.key ? "active" : ""}
              onClick={() => setActiveView(view.key)}
            >
              <span>{view.kicker}</span>
              <strong>{view.label}</strong>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>Dataset</span>
          <strong>{data?.dataset.name ?? "UCI Adult Income"}</strong>
        </div>
      </aside>

      <section className="main-stage">
        <header className="topbar">
          <div>
            <p className="eyebrow">High-stakes AI fairness cockpit</p>
            <h2>{activeViewTitle(activeView)}</h2>
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
            <ContextStrip data={data} lastRun={lastRun} />
            {activeView === "command" && <CommandCenter data={data} />}
            {activeView === "data" && <DataRoom data={data} />}
            {activeView === "audit" && <AuditWorkbench data={data} />}
            {activeView === "cases" && (
              <DecisionReview data={data} selectedCase={selectedCase} setSelectedCase={setSelectedCase} />
            )}
            {activeView === "mitigation" && (
              <MitigationLab
                data={data}
                visible={mitigationVisible}
                onToggle={() => setMitigationVisible((value) => !value)}
              />
            )}
            {activeView === "governance" && <GovernanceHub data={data} />}
          </>
        ) : null}
      </section>
    </main>
  );
}

function activeViewTitle(view: ViewKey) {
  return views.find((item) => item.key === view)?.label ?? "Command Center";
}

function ContextStrip({ data, lastRun }: { data: AuditResponse; lastRun: string }) {
  return (
    <section className="context-strip">
      <div>
        <span>{data.dataset.source}</span>
        <strong>{compactNumber(data.dataset.rows)} real rows</strong>
      </div>
      <div>
        <span>Protected audit</span>
        <strong>{data.dataset.protected_attribute}</strong>
      </div>
      <div>
        <span>Feature posture</span>
        <strong>{data.dataset.model_features} model features</strong>
      </div>
      <div>
        <span>Last run</span>
        <strong>{lastRun}</strong>
      </div>
    </section>
  );
}

function CommandCenter({ data }: { data: AuditResponse }) {
  const passed = data.policy.filter((check) => check.status === "Pass").length;

  return (
    <section className="tab-grid">
      <article className={`risk-panel span-6 ${data.risk.level.toLowerCase()}`}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Current risk</p>
            <h2>{data.risk.baseline_message}</h2>
          </div>
          <span>{data.risk.level}</span>
        </div>
        <p>{data.risk.mitigated_message}</p>
      </article>

      <MetricCard label="Baseline accuracy" value={percent(data.baseline.accuracy)} delta="Production candidate" />
      <MetricCard
        label="Parity gap"
        value={percent(data.baseline.demographic_parity_difference)}
        delta="Baseline risk"
        tone="danger"
      />
      <MetricCard
        label="Bias reduction"
        value={percent(data.comparison.bias_reduction)}
        delta="FairLens mitigation"
        tone="good"
      />

      <article className="panel span-7">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Approval rates</p>
            <h2>Outcome distribution by protected group</h2>
          </div>
          <span className="status-chip danger">Baseline</span>
        </div>
        <GroupBars groups={data.baseline.by_group} />
      </article>

      <article className="panel span-5">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Policy gates</p>
            <h2>{passed} of {data.policy.length} checks passing</h2>
          </div>
          <span className={passed === data.policy.length ? "status-chip good" : "status-chip danger"}>
            {passed === data.policy.length ? "Ready" : "Review"}
          </span>
        </div>
        <PolicyTable checks={data.policy} compact />
      </article>
    </section>
  );
}

function DataRoom({ data }: { data: AuditResponse }) {
  return (
    <section className="tab-grid">
      <article className="panel span-4">
        <p className="eyebrow">Target balance</p>
        <h2>{data.dataset.target}</h2>
        <div className="stat-ring" style={{ "--value": `${data.dataset.profile.positive_rate * 360}deg` } as CSSProperties}>
          <strong>{percent(data.dataset.profile.positive_rate)}</strong>
          <span>{data.model.positive_outcome}</span>
        </div>
      </article>

      <article className="panel span-8">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Base rates</p>
            <h2>Historical outcome rate by group</h2>
          </div>
        </div>
        <BaseRateBars groups={data.dataset.profile.protected_base_rates} />
      </article>

      <article className="panel span-6">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Numeric profile</p>
            <h2>Distribution snapshot</h2>
          </div>
        </div>
        <div className="data-table">
          <div className="table-head four"><span>Feature</span><span>Mean</span><span>Median</span><span>P90</span></div>
          {data.dataset.profile.numeric_profile.map((item) => (
            <div className="table-row four" key={item.feature}>
              <strong>{item.feature}</strong>
              <span>{number(item.mean)}</span>
              <span>{number(item.median)}</span>
              <span>{number(item.p90)}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel span-6">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Data quality</p>
            <h2>Audit readiness checks</h2>
          </div>
        </div>
        <div className="quality-list">
          {data.dataset.profile.data_quality.map((item) => (
            <div key={item.check}>
              <span>{item.check}</span>
              <strong>{item.status}</strong>
            </div>
          ))}
        </div>
      </article>

      <article className="panel span-12">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Categorical concentration</p>
            <h2>Top values across operational features</h2>
          </div>
        </div>
        <div className="category-grid">
          {data.dataset.profile.categorical_profile.map((feature) => (
            <div className="mini-card" key={feature.feature}>
              <strong>{feature.feature}</strong>
              {feature.top_values.map((value) => (
                <div className="mini-row" key={value.value}>
                  <span>{value.value}</span>
                  <em>{percent(value.share)}</em>
                </div>
              ))}
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function AuditWorkbench({ data }: { data: AuditResponse }) {
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
            <p className="eyebrow">Proxy intelligence</p>
            <h2>Feature-risk triage</h2>
          </div>
        </div>
        <p className="insight-copy">{data.explainability.insight}</p>
        <div className="proxy-list">
          {data.explainability.top_features.slice(0, 7).map((feature) => (
            <div key={feature.feature}>
              <span>{feature.feature}</span>
              <strong className={`risk-pill ${feature.proxy_risk.toLowerCase()}`}>{feature.proxy_risk}</strong>
            </div>
          ))}
        </div>
      </article>

      <article className="panel span-12">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Slice monitor</p>
            <h2>Segments with the largest approval-rate shift</h2>
          </div>
          <span className="status-chip danger">Needs review</span>
        </div>
        <SegmentTable segments={data.segments} />
      </article>
    </section>
  );
}

function DecisionReview({
  data,
  selectedCase,
  setSelectedCase
}: {
  data: AuditResponse;
  selectedCase: number;
  setSelectedCase: (value: number) => void;
}) {
  const activeCase = data.decision_cases[selectedCase] ?? data.decision_cases[0];

  return (
    <section className="tab-grid">
      <article className="panel span-4">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Review queue</p>
            <h2>Representative real cases</h2>
          </div>
        </div>
        <div className="case-list">
          {data.decision_cases.map((item, index) => (
            <button
              key={item.id}
              className={selectedCase === index ? "active" : ""}
              onClick={() => setSelectedCase(index)}
            >
              <span>{item.id}</span>
              <strong>{item.label}</strong>
              <em>{item.prediction} at {percent(item.probability)}</em>
            </button>
          ))}
        </div>
      </article>

      <article className="panel span-8 case-detail">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{activeCase.review_reason}</p>
            <h2>{activeCase.id}: {activeCase.prediction}</h2>
          </div>
          <span className={activeCase.prediction === "Denied" ? "status-chip danger" : "status-chip good"}>
            {activeCase.protected_group}
          </span>
        </div>

        <div className="decision-grid">
          <MetricCard label="Model probability" value={percent(activeCase.probability)} delta=">50K likelihood" />
          <MetricCard label="Actual outcome" value={activeCase.actual_outcome} delta="Held-out record" />
          <MetricCard label="Decision" value={activeCase.prediction} delta="Baseline model" />
        </div>

        <div className="case-columns">
          <div>
            <h3>Case attributes</h3>
            <div className="attribute-grid">
              {activeCase.attributes.map((attribute) => (
                <div key={attribute.label}>
                  <span>{attribute.label}</span>
                  <strong>{attribute.value ?? "n/a"}</strong>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3>Local explanation</h3>
            <div className="local-list">
              {activeCase.local_explanation.map((item) => (
                <div key={`${activeCase.id}-${item.feature}`}>
                  <span>{item.feature}</span>
                  <strong>{item.effect}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}

function MitigationLab({
  data,
  visible,
  onToggle
}: {
  data: AuditResponse;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="tab-grid">
      <article className="panel span-12 mitigation-hero">
        <div>
          <p className="eyebrow">Fairlearn mitigation</p>
          <h2>{data.model.mitigation}</h2>
          <p>
            The mitigated model optimizes decision thresholds with a demographic-parity constraint
            while keeping the baseline classifier auditable.
          </p>
        </div>
        <button className="primary-button" onClick={onToggle}>
          {visible ? "Hide comparison" : "Show comparison"}
        </button>
      </article>

      <article className="panel span-6 before-after-card">
        <p className="eyebrow">Before</p>
        <h2>Baseline model</h2>
        <MetricRow label="Accuracy" value={percent(data.baseline.accuracy)} />
        <MetricRow label="Parity gap" value={percent(data.baseline.demographic_parity_difference)} tone="danger" />
        <MetricRow label="Equalized odds" value={percent(data.baseline.equalized_odds_difference)} />
        <GroupBars groups={data.baseline.by_group} compact />
      </article>

      <article className={`panel span-6 before-after-card ${visible ? "revealed" : "locked"}`}>
        <p className="eyebrow">After</p>
        <h2>FairLens mitigation</h2>
        {visible ? (
          <>
            <MetricRow label="Accuracy" value={percent(data.mitigated.accuracy)} delta={signedPercent(data.comparison.accuracy_delta)} />
            <MetricRow label="Parity gap" value={percent(data.mitigated.demographic_parity_difference)} delta={signedPercent(data.comparison.bias_gap_delta)} tone="good" />
            <MetricRow label="Equalized odds" value={percent(data.mitigated.equalized_odds_difference)} />
            <GroupBars groups={data.mitigated.by_group} compact />
          </>
        ) : (
          <div className="locked-state">
            <span>Ready</span>
            <p>Mitigation output is staged for the before/after comparison.</p>
          </div>
        )}
      </article>

      <article className="panel span-12">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Scorecard</p>
            <h2>Accuracy trade-off versus fairness gain</h2>
          </div>
          <span className="status-chip good">{percent(data.comparison.bias_reduction)} bias reduction</span>
        </div>
        <div className="scorecard">
          {data.comparison.scorecard.map((item) => (
            <ScorecardRow key={item.label} item={item} />
          ))}
        </div>
      </article>
    </section>
  );
}

function GovernanceHub({ data }: { data: AuditResponse }) {
  return (
    <section className="tab-grid">
      <article className="panel span-5">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Model card</p>
            <h2>Deployment record</h2>
          </div>
          <button className="ghost-button compact-button" onClick={() => window.print()}>
            Print report
          </button>
        </div>
        <div className="model-card-list">
          {data.governance.model_card.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </article>

      <article className="panel span-7">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Review workflow</p>
            <h2>Responsible AI sign-off plan</h2>
          </div>
        </div>
        <div className="workflow">
          {data.governance.review_workflow.map((item, index) => (
            <div key={item.step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.step}</strong>
              <em>{item.status}</em>
              <small>{item.owner}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="panel span-7">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Policy checks</p>
            <h2>Mitigated model control gates</h2>
          </div>
        </div>
        <PolicyTable checks={data.policy} />
      </article>

      <article className="panel span-5">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Evidence pack</p>
            <h2>Judge-ready artifacts</h2>
          </div>
        </div>
        <div className="evidence-list">
          {data.governance.evidence_pack.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>
      </article>
    </section>
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

function BaseRateBars({
  groups
}: {
  groups: AuditResponse["dataset"]["profile"]["protected_base_rates"];
}) {
  const max = Math.max(...groups.map((group) => group.positive_rate ?? 0), 0.01);
  return (
    <div className="bar-list">
      {groups.map((group) => (
        <div className="bar-row" key={group.group}>
          <div className="bar-label">
            <strong>{group.group}</strong>
            <span>{percent(group.positive_rate)} base rate</span>
          </div>
          <div className="track">
            <div style={{ width: `${(((group.positive_rate ?? 0) / max) * 100).toFixed(2)}%` }} />
          </div>
          <div className="group-submetrics">
            <span>{compactNumber(group.count)} rows</span>
            <span>{percent(group.share)} of dataset</span>
          </div>
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
            <span className={`risk-pill ${feature.proxy_risk.toLowerCase()}`}>{feature.proxy_risk}</span>
          </div>
          <div className="track feature-track">
            <div style={{ width: `${Math.max(feature.relative_importance * 100, 2).toFixed(2)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SegmentTable({ segments }: { segments: SegmentDiagnostic[] }) {
  return (
    <div className="data-table">
      <div className="table-head segment-grid">
        <span>Dimension</span>
        <span>Segment</span>
        <span>Rows</span>
        <span>Selection</span>
        <span>Impact</span>
        <span>Priority</span>
      </div>
      {segments.map((segment) => (
        <div className="table-row segment-grid" key={`${segment.dimension}-${segment.segment}`}>
          <strong>{segment.dimension}</strong>
          <span>{segment.segment}</span>
          <span>{compactNumber(segment.count)}</span>
          <span>{percent(segment.selection_rate)}</span>
          <span>{signedPercent(segment.impact)}</span>
          <em className={`risk-pill ${segment.priority === "High" ? "high" : segment.priority === "Medium" ? "medium" : "low"}`}>
            {segment.priority}
          </em>
        </div>
      ))}
    </div>
  );
}

function PolicyTable({ checks, compact = false }: { checks: PolicyCheck[]; compact?: boolean }) {
  return (
    <div className={`policy-table ${compact ? "compact" : ""}`}>
      {checks.map((check) => {
        const value = check.name.toLowerCase().includes("ratio")
          ? number(check.mitigated, 2)
          : percent(check.mitigated);
        return (
          <div key={check.name}>
            <strong>{check.name}</strong>
            {!compact && <span>{check.target}</span>}
            <span>{value}</span>
            <em className={check.status === "Pass" ? "good" : "watch"}>{check.status}</em>
          </div>
        );
      })}
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
  const before = item.label.toLowerCase().includes("ratio") ? item.before.toFixed(2) : percent(item.before);
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
