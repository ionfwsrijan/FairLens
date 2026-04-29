"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type DatasetKey = "adult" | "german_credit";
type ProtectedAttribute = "sex" | "race" | "age_group";
type RoleKey = "Executive" | "ML Engineer" | "Compliance Reviewer" | "Auditor";
type ViewKey =
  | "command"
  | "data"
  | "audit"
  | "cases"
  | "mitigation"
  | "governance"
  | "report"
  | "custom"
  | "monitoring"
  | "architecture"
  | "pitch";

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

type RoleMetric = {
  label: string;
  value: number | string | null;
  format: "percent" | "signed_percent" | "ratio" | "count" | "text";
  rationale: string;
};

type RoleContext = {
  role: RoleKey;
  priority: string;
  decision_question: string;
  summary: string;
  metric_focus: RoleMetric[];
  recommended_actions: string[];
  dashboard_focus: string[];
  report_emphasis: string;
};

type AttributeChangeNotice = {
  previous: ProtectedAttribute;
  current: ProtectedAttribute;
  datasetLabel: string;
};

type FairnessThresholds = {
  maxParityGap: number;
  minAccuracy: number;
  minDisparateImpact: number;
};

type AuditResponse = {
  generated_at: string;
  dataset: {
    key: DatasetKey;
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
    supported_protected_attributes: ProtectedAttribute[];
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
  role_context: RoleContext;
  cache: {
    hit: boolean;
    path: string;
  };
};

type GovernanceReport = {
  generated_at: string;
  source: string;
  google_product: string;
  free_first: boolean;
  ai: {
    enabled: boolean;
    provider: string;
    model?: string;
    reason?: string;
  };
  sections: { title: string; body: string }[];
  markdown: string;
};

type CustomAuditResponse = {
  dataset: {
    name: string;
    rows: number;
    columns: string[];
    protected_attribute: string;
    prediction_column: string;
    actual_column: string;
    probability_column: string | null;
    protected_groups: { group: string; count: number; share: number }[];
  };
  metrics: ModelMetrics;
  probability_summary: { mean: number | null; median: number | null; p90: number | null } | null;
  risk: { level: string; message: string };
  policy: { name: string; target: string; value: number; status: "Pass" | "Review" }[];
};

type AuditRun = {
  id: string;
  created_at: string;
  dataset?: string;
  protected_attribute: string;
  accuracy: number;
  bias_gap: number;
  mitigated_bias_gap: number;
  risk_level: string;
};

type TimelinePoint = {
  label: string;
  dataset: DatasetKey;
  protectedAttribute: ProtectedAttribute;
  baselineGap: number;
  mitigatedGap: number;
  biasReduction: number;
  accuracy: number;
  status: "Ready" | "Review";
};

type AuditRequestOptions = {
  datasetKey?: DatasetKey;
  protectedAttribute?: ProtectedAttribute;
  role?: RoleKey;
  signal?: AbortSignal;
};

const API_URL = "";

const datasetOptions: {
  key: DatasetKey;
  label: string;
  protectedAttributes: ProtectedAttribute[];
}[] = [
  { key: "adult", label: "Adult Income", protectedAttributes: ["sex", "race"] },
  { key: "german_credit", label: "German Credit", protectedAttributes: ["sex", "age_group"] }
];

const roleOptions: RoleKey[] = ["Executive", "ML Engineer", "Compliance Reviewer", "Auditor"];

const defaultThresholds: FairnessThresholds = {
  maxParityGap: 0.05,
  minAccuracy: 0.75,
  minDisparateImpact: 0.8,
};

const views: { key: ViewKey; label: string; kicker: string }[] = [
  { key: "command", label: "Command Center", kicker: "Executive view" },
  { key: "data", label: "Data Room", kicker: "Dataset evidence" },
  { key: "audit", label: "Audit Workbench", kicker: "Bias and proxies" },
  { key: "cases", label: "Decision Review", kicker: "Human oversight" },
  { key: "mitigation", label: "Mitigation Lab", kicker: "Before and after" },
  { key: "governance", label: "Governance", kicker: "Model card" },
  { key: "report", label: "AI Report", kicker: "Gemini optional" },
  { key: "custom", label: "Custom Audit", kicker: "Upload CSV" },
  { key: "monitoring", label: "Monitoring", kicker: "Audit history" },
  { key: "architecture", label: "Free Architecture", kicker: "Zero-cost path" },
  { key: "pitch", label: "Pitch Room", kicker: "Submission story" }
];

const demoSequence: ViewKey[] = ["pitch", "command", "audit", "mitigation", "report", "cases", "architecture"];

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

function attributeLabel(attribute: ProtectedAttribute) {
  if (attribute === "sex") return "Gender";
  if (attribute === "race") return "Race";
  return "Age group";
}

function roleMetricValue(metric: RoleMetric) {
  if (metric.value === null || metric.value === undefined) return "n/a";
  if (typeof metric.value === "string") return metric.value;
  if (metric.format === "percent") return percent(metric.value);
  if (metric.format === "signed_percent") return signedPercent(metric.value);
  if (metric.format === "ratio") return number(metric.value, 2);
  if (metric.format === "count") return compactNumber(metric.value);
  return String(metric.value);
}

export default function Home() {
  const [datasetKey, setDatasetKey] = useState<DatasetKey>("adult");
  const [protectedAttribute, setProtectedAttribute] = useState<ProtectedAttribute>("sex");
  const [role, setRole] = useState<RoleKey>("Executive");
  const [activeView, setActiveView] = useState<ViewKey>("command");
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mitigationVisible, setMitigationVisible] = useState(true);
  const [selectedCase, setSelectedCase] = useState(0);
  const [demoStep, setDemoStep] = useState(0);
  const [attributeChangeNotice, setAttributeChangeNotice] = useState<AttributeChangeNotice | null>(null);
  const [thresholds, setThresholds] = useState<FairnessThresholds>(defaultThresholds);
  const activeDataset = datasetOptions.find((item) => item.key === datasetKey) ?? datasetOptions[0];
  const requestProtectedAttribute = activeDataset.protectedAttributes.includes(protectedAttribute)
    ? protectedAttribute
    : activeDataset.protectedAttributes[0];

  useEffect(() => {
    if (requestProtectedAttribute !== protectedAttribute) {
      setAttributeChangeNotice({
        previous: protectedAttribute,
        current: requestProtectedAttribute,
        datasetLabel: activeDataset.label
      });
      setProtectedAttribute(requestProtectedAttribute);
      return;
    }

    const controller = new AbortController();
    void loadAudit(false, {
      datasetKey,
      protectedAttribute: requestProtectedAttribute,
      role,
      signal: controller.signal
    });

    return () => controller.abort();
  }, [protectedAttribute, datasetKey, requestProtectedAttribute, role]);

  async function loadAudit(forceRefresh: boolean, options: AuditRequestOptions = {}) {
    const auditDatasetKey = options.datasetKey ?? datasetKey;
    const auditProtectedAttribute = options.protectedAttribute ?? requestProtectedAttribute;
    const auditRole = options.role ?? role;
    setLoading(!data);
    setRefreshing(Boolean(data));
    setError(null);
    setSelectedCase(0);
    try {
      const response = await fetch(
        `${API_URL}/api/audit?dataset=${auditDatasetKey}&protected_attribute=${auditProtectedAttribute}&role=${encodeURIComponent(auditRole)}&force_refresh=${forceRefresh}`,
        { signal: options.signal }
      );
      if (options.signal?.aborted) return;
      if (!response.ok) {
        const details = await response.json().catch(() => null);
        throw new Error(details?.detail ?? `API request failed with ${response.status}`);
      }
      const payload = (await response.json()) as AuditResponse;
      if (options.signal?.aborted) return;
      setData(payload);
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "Unable to load audit.");
    } finally {
      if (options.signal?.aborted) return;
      setLoading(false);
      setRefreshing(false);
    }
  }

  function selectDataset(nextDatasetKey: DatasetKey) {
    const nextDataset = datasetOptions.find((item) => item.key === nextDatasetKey) ?? datasetOptions[0];
    const nextProtectedAttribute = nextDataset.protectedAttributes.includes(protectedAttribute)
      ? protectedAttribute
      : nextDataset.protectedAttributes[0];

    setDatasetKey(nextDatasetKey);
    if (nextProtectedAttribute !== protectedAttribute) {
      setAttributeChangeNotice({
        previous: protectedAttribute,
        current: nextProtectedAttribute,
        datasetLabel: nextDataset.label
      });
      setProtectedAttribute(nextProtectedAttribute);
    }
  }

  function selectProtectedAttribute(nextAttribute: ProtectedAttribute) {
    if (nextAttribute === protectedAttribute) return;
    setAttributeChangeNotice({
      previous: requestProtectedAttribute,
      current: nextAttribute,
      datasetLabel: activeDataset.label
    });
    setProtectedAttribute(nextAttribute);
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
  const isStaleAudit = Boolean(
    data &&
      (data.dataset.key !== datasetKey ||
        data.dataset.protected_attribute !== requestProtectedAttribute ||
        data.role_context.role !== role)
  );
  const livePolicyChecks = useMemo(
    () => (data ? buildLivePolicyChecks(data, thresholds) : []),
    [data, thresholds]
  );

  return (
    <>
      <div className="dashboard-bg">
        <div className="bg-image"></div>
        <div className="bg-overlay"></div>
      </div>
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

        <div className="sidebar-controls">
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as RoleKey)}>
              {roleOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <button className="primary-button full-button" onClick={() => {
            const next = (demoStep + 1) % demoSequence.length;
            setDemoStep(next);
            setActiveView(demoSequence[next]);
          }}>
            Judge demo step {demoStep + 1}
          </button>
        </div>

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
            <div className="segmented" aria-label="Dataset">
              {datasetOptions.map((dataset) => (
                <button
                  key={dataset.key}
                  className={datasetKey === dataset.key ? "active" : ""}
                  onClick={() => selectDataset(dataset.key)}
                >
                  {dataset.label}
                </button>
              ))}
            </div>
            <div className="segmented" aria-label="Protected attribute">
              {activeDataset.protectedAttributes.map((attribute) => (
                <button
                  key={attribute}
                  className={protectedAttribute === attribute ? "active" : ""}
                  onClick={() => selectProtectedAttribute(attribute)}
                >
                  {attributeLabel(attribute)}
                </button>
              ))}
            </div>
            <button
              className="ghost-button"
              onClick={() =>
                loadAudit(true, {
                  datasetKey,
                  protectedAttribute: requestProtectedAttribute,
                  role
                })
              }
              disabled={refreshing}
            >
              {refreshing ? "Auditing" : "Re-run audit"}
            </button>
          </div>
        </header>

        {attributeChangeNotice && (
          <AttributeChangeNote notice={attributeChangeNotice} data={isStaleAudit ? null : data} />
        )}

        {error && (
          <section className="error-panel">
            <strong>Backend unavailable.</strong>
            <span>{error}</span>
          </section>
        )}

        {(loading && !data) || isStaleAudit ? (
          <section className="loading-grid">
            <div className="skeleton wide" />
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton tall" />
          </section>
        ) : data ? (
          <>
            <ContextStrip data={data} lastRun={lastRun} />
            <JudgeSummary data={data} policyChecks={livePolicyChecks} />
            <ThresholdSettings thresholds={thresholds} onChange={setThresholds} />
            {activeView === "command" && <CommandCenter data={data} policyChecks={livePolicyChecks} />}
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
            {activeView === "governance" && <GovernanceHub data={data} policyChecks={livePolicyChecks} />}
            {activeView === "report" && (
              <AIReportCenter
                data={data}
                datasetKey={datasetKey}
                protectedAttribute={protectedAttribute}
                role={role}
                policyChecks={livePolicyChecks}
              />
            )}
            {activeView === "custom" && <CustomAuditLab />}
            {activeView === "monitoring" && <MonitoringCenter data={data} />}
            {activeView === "architecture" && <FreeArchitecture />}
            {activeView === "pitch" && <PitchRoom />}
          </>
        ) : null}
      </section>
    </main>
    </>
  );
}

function activeViewTitle(view: ViewKey) {
  return views.find((item) => item.key === view)?.label ?? "Command Center";
}

function AttributeChangeNote({
  notice,
  data
}: {
  notice: AttributeChangeNotice;
  data: AuditResponse | null;
}) {
  const previous = attributeLabel(notice.previous);
  const current = attributeLabel(notice.current);

  return (
    <section className="attribute-change-note">
      <div>
        <p className="eyebrow">Why this changed</p>
        <h3>
          Metrics changed because FairLens is now auditing {current} groups instead of {previous} groups.
        </h3>
        <p>
          Group metrics, parity gaps, policy gates, mitigation outputs, and decision cases update for the selected
          protected audit. Global dataset fields like age, education, work history, and row counts may stay the same.
        </p>
      </div>
      <span className="status-chip">
        {data ? `${percent(data.baseline.demographic_parity_difference)} current gap` : `Updating ${notice.datasetLabel}`}
      </span>
    </section>
  );
}

function buildLivePolicyChecks(data: AuditResponse, thresholds: FairnessThresholds): PolicyCheck[] {
  return [
    {
      name: "Demographic parity gap",
      target: `<= ${percent(thresholds.maxParityGap)}`,
      baseline: data.baseline.demographic_parity_difference,
      mitigated: data.mitigated.demographic_parity_difference,
      status: data.mitigated.demographic_parity_difference <= thresholds.maxParityGap ? "Pass" : "Review",
      owner: "Fairness reviewer"
    },
    {
      name: "Disparate impact ratio",
      target: `>= ${number(thresholds.minDisparateImpact, 2)}`,
      baseline: data.baseline.demographic_parity_ratio,
      mitigated: data.mitigated.demographic_parity_ratio,
      status: data.mitigated.demographic_parity_ratio >= thresholds.minDisparateImpact ? "Pass" : "Review",
      owner: "Compliance lead"
    },
    {
      name: "Minimum mitigated accuracy",
      target: `>= ${percent(thresholds.minAccuracy)}`,
      baseline: data.baseline.accuracy,
      mitigated: data.mitigated.accuracy,
      status: data.mitigated.accuracy >= thresholds.minAccuracy ? "Pass" : "Review",
      owner: "Product owner"
    }
  ];
}

function JudgeSummary({ data, policyChecks }: { data: AuditResponse; policyChecks: PolicyCheck[] }) {
  const passed = policyChecks.filter((check) => check.status === "Pass").length;
  const ready = policyChecks.length > 0 && passed === policyChecks.length;
  const auditLabel = attributeLabel(data.dataset.protected_attribute);

  return (
    <section className={`judge-summary ${ready ? "ready" : "review"}`}>
      <div className="judge-summary-copy">
        <p className="eyebrow">Judge summary</p>
        <h3>{ready ? "Mitigated model is ready for controlled review." : "Baseline model needs fairness review."}</h3>
        <p>
          FairLens found a {percent(data.baseline.demographic_parity_difference)} {auditLabel} parity gap and reduced it
          to {percent(data.mitigated.demographic_parity_difference)} after mitigation.
        </p>
      </div>
      <div className="judge-summary-grid">
        <div>
          <span>Bias found</span>
          <strong>{percent(data.baseline.demographic_parity_difference)}</strong>
        </div>
        <div>
          <span>Mitigation applied</span>
          <strong>Fairlearn</strong>
        </div>
        <div>
          <span>Bias reduced by</span>
          <strong>{percent(data.comparison.bias_reduction)}</strong>
        </div>
        <div>
          <span>Decision</span>
          <strong>{ready ? "Ready" : "Needs Review"}</strong>
        </div>
      </div>
    </section>
  );
}

function ThresholdSettings({
  thresholds,
  onChange
}: {
  thresholds: FairnessThresholds;
  onChange: (thresholds: FairnessThresholds) => void;
}) {
  function updateThreshold(key: keyof FairnessThresholds, value: number) {
    onChange({ ...thresholds, [key]: value });
  }

  return (
    <section className="threshold-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Fairness thresholds</p>
          <h2>Live policy settings</h2>
        </div>
        <span className="status-chip">Updates gates instantly</span>
      </div>
      <div className="threshold-grid">
        <label>
          <span>Acceptable parity gap</span>
          <strong>{percent(thresholds.maxParityGap)}</strong>
          <input
            type="range"
            min="0.01"
            max="0.2"
            step="0.01"
            value={thresholds.maxParityGap}
            onChange={(event) => updateThreshold("maxParityGap", Number(event.target.value))}
          />
          <small>Lower is stricter for demographic parity.</small>
        </label>
        <label>
          <span>Minimum accuracy</span>
          <strong>{percent(thresholds.minAccuracy)}</strong>
          <input
            type="range"
            min="0.5"
            max="0.95"
            step="0.01"
            value={thresholds.minAccuracy}
            onChange={(event) => updateThreshold("minAccuracy", Number(event.target.value))}
          />
          <small>Controls the minimum acceptable mitigated accuracy.</small>
        </label>
        <label>
          <span>Disparate impact threshold</span>
          <strong>{number(thresholds.minDisparateImpact, 2)}</strong>
          <input
            type="range"
            min="0.6"
            max="1"
            step="0.01"
            value={thresholds.minDisparateImpact}
            onChange={(event) => updateThreshold("minDisparateImpact", Number(event.target.value))}
          />
          <small>Higher requires closer selection-rate parity.</small>
        </label>
      </div>
    </section>
  );
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
        <strong>{attributeLabel(data.dataset.protected_attribute)}</strong>
      </div>
      <div>
        <span>Role lens</span>
        <strong>{data.role_context.role}</strong>
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

function CommandCenter({ data, policyChecks }: { data: AuditResponse; policyChecks: PolicyCheck[] }) {
  const passed = policyChecks.filter((check) => check.status === "Pass").length;

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

      <RoleBrief context={data.role_context} />

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
            <h2>{passed} of {policyChecks.length} checks passing</h2>
          </div>
          <span className={passed === policyChecks.length ? "status-chip good" : "status-chip danger"}>
            {passed === policyChecks.length ? "Ready" : "Review"}
          </span>
        </div>
        <PolicyTable checks={policyChecks} compact />
      </article>
    </section>
  );
}

function RoleBrief({ context }: { context: RoleContext }) {
  return (
    <article className="panel span-12 role-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{context.role} lens</p>
          <h2>{context.priority}</h2>
        </div>
        <span className="status-chip good">Backend aware</span>
      </div>
      <p className="insight-copy">{context.summary}</p>
      <div className="role-metric-grid">
        {context.metric_focus.map((metric) => (
          <div key={metric.label}>
            <span>{metric.label}</span>
            <strong>{roleMetricValue(metric)}</strong>
            <p>{metric.rationale}</p>
          </div>
        ))}
      </div>
      <div className="role-action-grid">
        <div>
          <span>Decision question</span>
          <strong>{context.decision_question}</strong>
        </div>
        <div>
          <span>Recommended next action</span>
          <strong>{context.recommended_actions[0]}</strong>
        </div>
        <div>
          <span>Focus areas</span>
          <strong>{context.dashboard_focus.join(" / ")}</strong>
        </div>
      </div>
    </article>
  );
}

function DataRoom({ data }: { data: AuditResponse }) {
  const auditLabel = attributeLabel(data.dataset.protected_attribute);

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
            <h2>Historical outcome rate by {auditLabel}</h2>
          </div>
        </div>
        <BaseRateBars groups={data.dataset.profile.protected_base_rates} />
      </article>

      <article className="panel span-6">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Numeric profile</p>
            <h2>Global distribution snapshot</h2>
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
            <h2>Global top values across operational features</h2>
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
  const auditLabel = attributeLabel(data.dataset.protected_attribute);

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
            <p className="eyebrow">{auditLabel} model outcomes</p>
            <h2>Baseline approval, error, and accuracy by selected group</h2>
          </div>
          <span className="status-chip danger">{percent(data.baseline.demographic_parity_difference)} gap</span>
        </div>
        <GroupBars groups={data.baseline.by_group} />
      </article>

      <article className="panel span-12">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Slice monitor</p>
            <h2>Segments with the largest approval-rate shift for {auditLabel}</h2>
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
  const auditLabel = attributeLabel(data.dataset.protected_attribute);
  const [reviewStatus, setReviewStatus] = useState("Needs review");
  const [reviewDecision, setReviewDecision] = useState("Pending");
  const [reviewNote, setReviewNote] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  async function saveReview() {
    setSaveState("saving");
    await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        case_id: activeCase.id,
        status: reviewStatus,
        decision: reviewDecision,
        note: reviewNote,
        reviewer: "Hackathon reviewer"
      })
    });
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 1500);
  }

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
            {auditLabel}: {activeCase.protected_group}
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

        <div className="review-box">
          <h3>Reviewer action</h3>
          <div className="form-grid compact-form">
            <label>Status
              <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)}>
                <option>Needs review</option>
                <option>Escalated</option>
                <option>Approved for mitigation</option>
                <option>Closed</option>
              </select>
            </label>
            <label>Decision
              <select value={reviewDecision} onChange={(event) => setReviewDecision(event.target.value)}>
                <option>Pending</option>
                <option>Uphold decision</option>
                <option>Override decision</option>
                <option>Request more evidence</option>
              </select>
            </label>
          </div>
          <textarea
            className="note-box"
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            placeholder="Add reviewer note for the audit trail"
          />
          <button className="primary-button" onClick={saveReview}>
            {saveState === "saving" ? "Saving" : saveState === "saved" ? "Saved" : "Save review"}
          </button>
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
  const auditLabel = attributeLabel(data.dataset.protected_attribute);

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
        <h2>Baseline model by {auditLabel}</h2>
        <MetricRow label="Accuracy" value={percent(data.baseline.accuracy)} />
        <MetricRow label="Parity gap" value={percent(data.baseline.demographic_parity_difference)} tone="danger" />
        <MetricRow label="Equalized odds" value={percent(data.baseline.equalized_odds_difference)} />
        <GroupBars groups={data.baseline.by_group} compact />
      </article>

      <article className={`panel span-6 before-after-card ${visible ? "revealed" : "locked"}`}>
        <p className="eyebrow">After</p>
        <h2>FairLens mitigation by {auditLabel}</h2>
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

function GovernanceHub({ data, policyChecks }: { data: AuditResponse; policyChecks: PolicyCheck[] }) {
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
        <PolicyTable checks={policyChecks} />
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

function AIReportCenter({
  data,
  datasetKey,
  protectedAttribute,
  role,
  policyChecks
}: {
  data: AuditResponse;
  datasetKey: DatasetKey;
  protectedAttribute: ProtectedAttribute;
  role: RoleKey;
  policyChecks: PolicyCheck[];
}) {
  const [report, setReport] = useState<GovernanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport(useAi: boolean, signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/report?dataset=${datasetKey}&protected_attribute=${protectedAttribute}&role=${encodeURIComponent(role)}&use_ai=${useAi}`,
        { signal }
      );
      if (signal?.aborted) return;
      if (!response.ok) {
        const details = await response.json().catch(() => null);
        throw new Error(details?.detail ?? "Report generation failed.");
      }
      const nextReport = (await response.json()) as GovernanceReport;
      if (signal?.aborted) return;
      setReport(nextReport);
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "Report generation failed.");
    } finally {
      if (signal?.aborted) return;
      setLoading(false);
    }
  }

  function downloadReport() {
    if (!report) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>FairLens Report</title><style>body{font-family:Arial,sans-serif;max-width:860px;margin:40px auto;line-height:1.6;color:#172026}h1,h2{color:#08686a}</style></head><body><h1>FairLens AI Governance Report</h1>${report.sections.map((section) => `<h2>${section.title}</h2><p>${section.body}</p>`).join("")}</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fairlens-governance-report.html";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadPdfReport() {
    if (!report) return;
    const pdf = buildGovernancePdf(data, report, policyChecks);
    const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fairlens-${datasetKey}-${protectedAttribute}-${role.toLowerCase().replaceAll(" ", "-")}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    void loadReport(false, controller.signal);
    return () => controller.abort();
  }, [datasetKey, protectedAttribute, role]);

  const activeReport = report;

  return (
    <section className="tab-grid">
      <article className="panel span-5">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Free-first Google AI</p>
            <h2>Governance report generator</h2>
          </div>
        </div>
        <p className="insight-copy">
          FairLens creates a polished local report for free. Add a Google AI Studio Gemini API key
          on the backend to unlock the optional Gemini-written version without changing the UI.
        </p>
        <div className="action-stack">
          <button className="primary-button" onClick={() => loadReport(true)} disabled={loading}>
            {loading ? "Generating" : "Try Gemini report"}
          </button>
          <button className="ghost-button" onClick={() => window.print()}>
            Print report
          </button>
          <button className="ghost-button" onClick={downloadPdfReport} disabled={!report}>
            Export PDF
          </button>
          <button className="ghost-button" onClick={downloadReport} disabled={!report}>
            Export HTML
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
        {activeReport && (
          <div className="report-meta">
            <div><span>Source</span><strong>{activeReport.source}</strong></div>
            <div><span>Google product</span><strong>{activeReport.google_product}</strong></div>
            <div><span>AI status</span><strong>{activeReport.ai.enabled ? "Gemini enabled" : "Local free mode"}</strong></div>
            {activeReport.ai.reason && <div><span>Note</span><strong>{activeReport.ai.reason}</strong></div>}
          </div>
        )}
      </article>

      <article className="panel span-7 report-preview">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Judge-ready narrative</p>
            <h2>AI governance report</h2>
          </div>
          <span className="status-chip good">Free mode safe</span>
        </div>
        {(activeReport?.sections ?? []).map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            <p>{section.body}</p>
          </section>
        ))}
      </article>

      <article className="panel span-12">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Metrics behind the report</p>
            <h2>Evidence still comes from the audited model</h2>
          </div>
        </div>
        <div className="decision-grid">
          <MetricCard label="Baseline gap" value={percent(data.baseline.demographic_parity_difference)} delta="Measured disparity" tone="danger" />
          <MetricCard label="Mitigated gap" value={percent(data.mitigated.demographic_parity_difference)} delta="FairLens policy" tone="good" />
          <MetricCard label="Accuracy" value={percent(data.mitigated.accuracy)} delta="After mitigation" />
        </div>
      </article>
    </section>
  );
}

type PdfTextLine = {
  text: string;
  size?: number;
  bold?: boolean;
  color?: "dark" | "muted" | "green" | "red";
  gapAfter?: number;
};

function buildGovernancePdf(data: AuditResponse, report: GovernanceReport, policyChecks: PolicyCheck[]) {
  const auditLabel = attributeLabel(data.dataset.protected_attribute);
  const ready = policyChecks.length > 0 && policyChecks.every((check) => check.status === "Pass");
  const passed = policyChecks.filter((check) => check.status === "Pass").length;
  const summaryLines: PdfTextLine[] = [
    { text: "FairLens AI Governance Report", size: 22, bold: true, color: "dark", gapAfter: 12 },
    { text: `${data.dataset.name} | ${auditLabel} audit | ${data.role_context.role} lens`, size: 11, color: "muted", gapAfter: 10 },
    { text: `Generated: ${new Date(report.generated_at).toLocaleString()}`, size: 9, color: "muted", gapAfter: 18 },
    { text: "Judge Summary", size: 15, bold: true, color: "dark", gapAfter: 8 },
    { text: `Bias found: ${percent(data.baseline.demographic_parity_difference)}`, size: 11, color: "red" },
    { text: `Mitigation applied: Fairlearn demographic parity post-processing`, size: 11 },
    { text: `Bias reduced by: ${percent(data.comparison.bias_reduction)}`, size: 11, color: "green" },
    { text: `Decision: ${ready ? "Ready for controlled review" : "Needs Review"}`, size: 11, bold: true, color: ready ? "green" : "red", gapAfter: 16 },
    { text: "Key Evidence", size: 15, bold: true, color: "dark", gapAfter: 8 },
    { text: `Baseline accuracy: ${percent(data.baseline.accuracy)}`, size: 10 },
    { text: `Mitigated accuracy: ${percent(data.mitigated.accuracy)}`, size: 10 },
    { text: `Baseline parity gap: ${percent(data.baseline.demographic_parity_difference)}`, size: 10 },
    { text: `Mitigated parity gap: ${percent(data.mitigated.demographic_parity_difference)}`, size: 10 },
    { text: `Disparate impact ratio: ${number(data.mitigated.demographic_parity_ratio, 2)}`, size: 10 },
    { text: `Policy gates: ${passed} of ${policyChecks.length} passing`, size: 10, gapAfter: 16 },
    { text: "Role-Specific Focus", size: 15, bold: true, color: "dark", gapAfter: 8 },
    { text: data.role_context.summary, size: 10 },
    { text: `Decision question: ${data.role_context.decision_question}`, size: 10 },
    { text: `Recommended action: ${data.role_context.recommended_actions[0]}`, size: 10, gapAfter: 16 },
  ];

  const sectionLines = report.sections.flatMap((section) => [
    { text: section.title, size: 14, bold: true, color: "dark" as const, gapAfter: 6 },
    { text: section.body, size: 10, color: "dark" as const, gapAfter: 14 },
  ]);

  return createSimplePdf([...summaryLines, ...sectionLines]);
}

function createSimplePdf(lines: PdfTextLine[]) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 54;
  const contentWidth = pageWidth - margin * 2;
  const bottomMargin = 54;
  const pages: string[] = [];
  let commands: string[] = [];
  let y = pageHeight - margin;
  let pageNumber = 1;

  function beginPage() {
    commands = [
      "0.06 0.06 0.07 rg",
      `0 ${pageHeight - 72} ${pageWidth} 72 re f`,
      "0.00 1.00 0.62 rg",
      `0 ${pageHeight - 76} ${pageWidth} 4 re f`,
      "BT",
      "1 1 1 rg",
      "/F2 13 Tf",
      `1 0 0 1 ${margin} ${pageHeight - 42} Tm`,
      `(FairLens) Tj`,
      "0.65 0.75 0.67 rg",
      "/F1 8 Tf",
      `1 0 0 1 ${pageWidth - 138} ${pageHeight - 42} Tm`,
      `(Responsible AI Audit) Tj`,
      "ET",
    ];
    y = pageHeight - 104;
  }

  function endPage() {
    commands.push(
      "BT",
      "0.45 0.49 0.46 rg",
      "/F1 8 Tf",
      `1 0 0 1 ${margin} 30 Tm`,
      `(FairLens governance evidence | Page ${pageNumber}) Tj`,
      "ET"
    );
    pages.push(commands.join("\n"));
    pageNumber += 1;
  }

  function addPageIfNeeded(requiredHeight: number) {
    if (y - requiredHeight >= bottomMargin) return;
    endPage();
    beginPage();
  }

  beginPage();
  for (const item of lines) {
    const size = item.size ?? 10;
    const wrapped = wrapPdfText(item.text, Math.max(24, Math.floor(contentWidth / (size * 0.52))));
    const lineHeight = size + 4;
    const blockHeight = wrapped.length * lineHeight + (item.gapAfter ?? 4);
    addPageIfNeeded(blockHeight);

    commands.push("BT", pdfColor(item.color ?? "dark"), `/${item.bold ? "F2" : "F1"} ${size} Tf`);
    for (const line of wrapped) {
      commands.push(`1 0 0 1 ${margin} ${y} Tm`, `(${escapePdfText(line)}) Tj`);
      y -= lineHeight;
    }
    commands.push("ET");
    y -= item.gapAfter ?? 4;
  }
  endPage();

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${index + 3} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];

  const contentStart = 3 + pages.length;
  pages.forEach((_, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${contentStart + pages.length} 0 R /F2 ${contentStart + pages.length + 1} 0 R >> >> /Contents ${contentStart + index} 0 R >>`
    );
  });
  pages.forEach((page) => {
    objects.push(`<< /Length ${page.length} >>\nstream\n${page}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function wrapPdfText(text: string, maxChars: number) {
  const normalized = sanitizePdfText(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      return;
    }
    if (current) lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function sanitizePdfText(text: string) {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, " ");
}

function escapePdfText(text: string) {
  return sanitizePdfText(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfColor(color: PdfTextLine["color"]) {
  if (color === "green") return "0.00 0.78 0.42 rg";
  if (color === "red") return "0.78 0.26 0.26 rg";
  if (color === "muted") return "0.38 0.43 0.39 rg";
  return "0.08 0.09 0.08 rg";
}

function CustomAuditLab() {
  const [csvText, setCsvText] = useState(
    "sex,prediction,actual,probability\nMale,1,1,0.81\nFemale,0,1,0.42\nMale,1,0,0.73\nFemale,0,0,0.21\nFemale,1,1,0.66\nMale,1,1,0.91\n"
  );
  const [protectedColumn, setProtectedColumn] = useState("sex");
  const [predictionColumn, setPredictionColumn] = useState("prediction");
  const [actualColumn, setActualColumn] = useState("actual");
  const [probabilityColumn, setProbabilityColumn] = useState("probability");
  const [result, setResult] = useState<CustomAuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runUploadAudit() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/custom-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv_text: csvText,
          protected_attribute: protectedColumn,
          prediction_column: predictionColumn,
          actual_column: actualColumn,
          probability_column: probabilityColumn || null
        })
      });
      if (!response.ok) {
        const details = await response.json().catch(() => null);
        throw new Error(details?.detail ?? "Upload audit failed.");
      }
      setResult((await response.json()) as CustomAuditResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Upload audit failed.");
    } finally {
      setLoading(false);
    }
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setCsvText(await file.text());
  }

  function downloadSampleCsv() {
    const blob = new Blob([csvText], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fairlens-sample-audit.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="tab-grid">
      <article className="panel span-5">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Bring your own predictions</p>
            <h2>CSV fairness audit</h2>
          </div>
        </div>
        <div className="form-grid">
          <label>Protected column<input value={protectedColumn} onChange={(event) => setProtectedColumn(event.target.value)} /></label>
          <label>Prediction column<input value={predictionColumn} onChange={(event) => setPredictionColumn(event.target.value)} /></label>
          <label>Actual column<input value={actualColumn} onChange={(event) => setActualColumn(event.target.value)} /></label>
          <label>Probability column<input value={probabilityColumn} onChange={(event) => setProbabilityColumn(event.target.value)} /></label>
          <label className="file-input">CSV file<input type="file" accept=".csv,text/csv" onChange={(event) => loadFile(event.target.files?.[0])} /></label>
        </div>
        <button className="primary-button full-button" onClick={runUploadAudit} disabled={loading}>
          {loading ? "Auditing" : "Run uploaded audit"}
        </button>
        <button className="ghost-button full-button secondary-action" onClick={downloadSampleCsv}>
          Download sample CSV
        </button>
        {error && <p className="form-error">{error}</p>}
      </article>

      <article className="panel span-7">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">CSV editor</p>
            <h2>Paste or upload prediction data</h2>
          </div>
        </div>
        <textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} className="csv-box" />
      </article>

      {result && (
        <>
          <MetricCard label="Uploaded rows" value={compactNumber(result.dataset.rows)} delta="Audited records" />
          <MetricCard label="Accuracy" value={percent(result.metrics.accuracy)} delta="Uploaded model" />
          <MetricCard label="Parity gap" value={percent(result.metrics.demographic_parity_difference)} delta={result.risk.level} tone={result.risk.level === "High" ? "danger" : "neutral"} />
          <article className="panel span-6">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Uploaded group outcomes</p>
                <h2>{result.risk.message}</h2>
              </div>
            </div>
            <GroupBars groups={result.metrics.by_group} />
          </article>
          <article className="panel span-6">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Policy gates</p>
                <h2>Uploaded model controls</h2>
              </div>
            </div>
            <div className="policy-table">
              {result.policy.map((check) => (
                <div key={check.name}>
                  <strong>{check.name}</strong>
                  <span>{check.target}</span>
                  <span>{check.name.toLowerCase().includes("ratio") ? number(check.value, 2) : percent(check.value)}</span>
                  <em className={check.status === "Pass" ? "good" : "watch"}>{check.status}</em>
                </div>
              ))}
            </div>
          </article>
        </>
      )}
    </section>
  );
}

function MonitoringCenter({ data }: { data: AuditResponse }) {
  const [runs, setRuns] = useState<AuditRun[]>([]);
  const timeline = buildAuditTimeline(data, runs);

  useEffect(() => {
    fetch("/api/runs")
      .then((response) => response.json())
      .then((payload) => setRuns(payload.runs ?? []))
      .catch(() => setRuns([]));
  }, []);

  const visibleRuns = runs.length
    ? runs
    : [
        {
          id: "current-demo-run",
          created_at: data.generated_at,
          protected_attribute: data.dataset.protected_attribute,
          accuracy: data.baseline.accuracy,
          bias_gap: data.baseline.demographic_parity_difference,
          mitigated_bias_gap: data.mitigated.demographic_parity_difference,
          risk_level: data.risk.level
        }
      ];
  const simulation = [
    { month: "Jan", baseline: data.baseline.demographic_parity_difference * 0.82, mitigated: data.mitigated.demographic_parity_difference * 1.1 },
    { month: "Feb", baseline: data.baseline.demographic_parity_difference * 0.94, mitigated: data.mitigated.demographic_parity_difference * 1.3 },
    { month: "Mar", baseline: data.baseline.demographic_parity_difference * 1.08, mitigated: data.mitigated.demographic_parity_difference * 1.8 },
    { month: "Apr", baseline: data.baseline.demographic_parity_difference * 1.18, mitigated: data.mitigated.demographic_parity_difference * 2.2 },
  ];

  return (
    <section className="tab-grid">
      <article className="panel span-12">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Audit timeline</p>
            <h2>Bias gap trend across the main hackathon scenarios</h2>
          </div>
          <span className="status-chip good">{timeline.length} audit lenses</span>
        </div>
        <div className="audit-timeline">
          {timeline.map((point, index) => (
            <div className="timeline-item" key={`${point.dataset}-${point.protectedAttribute}`}>
              <div className="timeline-index">{String(index + 1).padStart(2, "0")}</div>
              <div className="timeline-card">
                <div className="timeline-title">
                  <span>{point.label}</span>
                  <strong>{point.status}</strong>
                </div>
                <div className="timeline-bars">
                  <div>
                    <span>Baseline {percent(point.baselineGap)}</span>
                    <div className="track"><div style={{ width: `${Math.min(point.baselineGap * 260, 100)}%` }} /></div>
                  </div>
                  <div>
                    <span>Mitigated {percent(point.mitigatedGap)}</span>
                    <div className="track mitigated-track"><div style={{ width: `${Math.min(point.mitigatedGap * 260, 100)}%` }} /></div>
                  </div>
                </div>
                <div className="timeline-meta">
                  <span>{percent(point.biasReduction)} reduction</span>
                  <span>{percent(point.accuracy)} accuracy</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="panel span-12">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Fairness drift monitor</p>
            <h2>Audit history and mitigation trend</h2>
          </div>
          <span className="status-chip">Local free storage</span>
        </div>
        <div className="history-grid">
          {visibleRuns.slice(-8).map((run) => (
            <div className="history-card" key={run.id}>
              <span>{new Date(run.created_at).toLocaleString()}</span>
              <strong>{run.protected_attribute} audit</strong>
              <div className="mini-row"><span>Baseline gap</span><em>{percent(run.bias_gap)}</em></div>
              <div className="mini-row"><span>Mitigated gap</span><em>{percent(run.mitigated_bias_gap)}</em></div>
              <div className="mini-row"><span>Accuracy</span><em>{percent(run.accuracy)}</em></div>
            </div>
          ))}
        </div>
      </article>
      <article className="panel span-12">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Synthetic monitoring simulation</p>
            <h2>Monthly drift scenario from held-out audit behavior</h2>
          </div>
          <span className="status-chip danger">Drift watch</span>
        </div>
        <div className="drift-grid">
          {simulation.map((item) => (
            <div className="drift-card" key={item.month}>
              <strong>{item.month}</strong>
              <div className="track"><div style={{ width: `${Math.min(item.baseline * 260, 100)}%` }} /></div>
              <span>Baseline gap {percent(item.baseline)}</span>
              <div className="track mitigated-track"><div style={{ width: `${Math.min(item.mitigated * 260, 100)}%` }} /></div>
              <span>Mitigated gap {percent(item.mitigated)}</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function buildAuditTimeline(data: AuditResponse, runs: AuditRun[]): TimelinePoint[] {
  const fallback: TimelinePoint[] = [
    {
      label: "Adult Income / Gender",
      dataset: "adult",
      protectedAttribute: "sex",
      baselineGap: data.dataset.key === "adult" && data.dataset.protected_attribute === "sex"
        ? data.baseline.demographic_parity_difference
        : 0.297,
      mitigatedGap: data.dataset.key === "adult" && data.dataset.protected_attribute === "sex"
        ? data.mitigated.demographic_parity_difference
        : 0.008,
      biasReduction: data.dataset.key === "adult" && data.dataset.protected_attribute === "sex"
        ? data.comparison.bias_reduction
        : 0.974,
      accuracy: data.dataset.key === "adult" && data.dataset.protected_attribute === "sex"
        ? data.mitigated.accuracy
        : 0.827,
      status: "Ready",
    },
    {
      label: "Adult Income / Race",
      dataset: "adult",
      protectedAttribute: "race",
      baselineGap: data.dataset.key === "adult" && data.dataset.protected_attribute === "race"
        ? data.baseline.demographic_parity_difference
        : 0.238,
      mitigatedGap: data.dataset.key === "adult" && data.dataset.protected_attribute === "race"
        ? data.mitigated.demographic_parity_difference
        : 0.019,
      biasReduction: data.dataset.key === "adult" && data.dataset.protected_attribute === "race"
        ? data.comparison.bias_reduction
        : 0.92,
      accuracy: data.dataset.key === "adult" && data.dataset.protected_attribute === "race"
        ? data.mitigated.accuracy
        : 0.821,
      status: "Ready",
    },
    {
      label: "German Credit / Gender",
      dataset: "german_credit",
      protectedAttribute: "sex",
      baselineGap: data.dataset.key === "german_credit" && data.dataset.protected_attribute === "sex"
        ? data.baseline.demographic_parity_difference
        : 0.038,
      mitigatedGap: data.dataset.key === "german_credit" && data.dataset.protected_attribute === "sex"
        ? data.mitigated.demographic_parity_difference
        : 0.018,
      biasReduction: data.dataset.key === "german_credit" && data.dataset.protected_attribute === "sex"
        ? data.comparison.bias_reduction
        : 0.526,
      accuracy: data.dataset.key === "german_credit" && data.dataset.protected_attribute === "sex"
        ? data.mitigated.accuracy
        : 0.72,
      status: "Ready",
    },
    {
      label: "German Credit / Age",
      dataset: "german_credit",
      protectedAttribute: "age_group",
      baselineGap: data.dataset.key === "german_credit" && data.dataset.protected_attribute === "age_group"
        ? data.baseline.demographic_parity_difference
        : 0.285,
      mitigatedGap: data.dataset.key === "german_credit" && data.dataset.protected_attribute === "age_group"
        ? data.mitigated.demographic_parity_difference
        : 0.026,
      biasReduction: data.dataset.key === "german_credit" && data.dataset.protected_attribute === "age_group"
        ? data.comparison.bias_reduction
        : 0.909,
      accuracy: data.dataset.key === "german_credit" && data.dataset.protected_attribute === "age_group"
        ? data.mitigated.accuracy
        : 0.71,
      status: "Review",
    },
  ];

  return fallback.map((point) => {
    const run = [...runs].reverse().find((item) =>
      normalizeDatasetKey(item.dataset) === point.dataset &&
      item.protected_attribute === point.protectedAttribute
    );
    if (!run) return point;
    return {
      ...point,
      baselineGap: run.bias_gap,
      mitigatedGap: run.mitigated_bias_gap,
      biasReduction: run.bias_gap ? Math.max(0, (run.bias_gap - run.mitigated_bias_gap) / run.bias_gap) : point.biasReduction,
      accuracy: run.accuracy,
      status: run.mitigated_bias_gap < 0.05 ? "Ready" : "Review",
    };
  });
}

function normalizeDatasetKey(dataset: string | undefined): DatasetKey | null {
  if (dataset === "adult" || dataset === "german_credit") return dataset;
  return null;
}

function FreeArchitecture() {
  const cards = [
    {
      title: "Frontend",
      value: "Vercel Hobby",
      body: "Free deployment for the Next.js dashboard. No paid Google Cloud dependency required."
    },
    {
      title: "Backend",
      value: "Render Free Web Service",
      body: "Runs FastAPI fairness engine on a free instance. Cold starts are acceptable for a hackathon demo."
    },
    {
      title: "Google product",
      value: "Gemini API free tier",
      body: "Optional AI report generation through Google AI Studio API key. Local report remains available without a key."
    },
    {
      title: "Persistence",
      value: "Local JSON first",
      body: "Free local audit history and review notes. Firestore Spark can be a future free-tier option."
    },
    {
      title: "Optional upgrade",
      value: "Cloud Run",
      body: "Cloud Run is a strong Google story, but it can require billing setup, so it stays optional for no-paid mode."
    }
  ];

  return (
    <section className="tab-grid">
      <article className="panel span-12 narrative-panel">
        <p className="eyebrow">Zero-cost deployment strategy</p>
        <h2>Use Google where it helps the story, without forcing paid infrastructure.</h2>
        <p>
          The safest free hackathon path is Vercel for the web app, Render for the FastAPI backend,
          and Google Gemini API free tier for the AI governance report. Cloud Run remains documented
          as an optional Google Cloud deployment when billing is available.
        </p>
      </article>
      {cards.map((card) => (
        <article className="panel span-4 architecture-card" key={card.title}>
          <p className="eyebrow">{card.title}</p>
          <h2>{card.value}</h2>
          <p>{card.body}</p>
        </article>
      ))}
    </section>
  );
}

function PitchRoom() {
  const story = [
    {
      title: "Problem",
      body: "High-stakes AI systems can appear accurate while quietly distributing opportunities unfairly across protected groups."
    },
    {
      title: "Solution",
      body: "FairLens audits real historical data, explains proxy risk, mitigates measurable disparities, and packages the evidence for human review."
    },
    {
      title: "Google product",
      body: "The optional Gemini API turns raw fairness metrics into an executive governance report while preserving a free local fallback."
    },
    {
      title: "Impact",
      body: "Teams get a practical workflow for catching bias before deployment and monitoring it after launch."
    }
  ];

  return (
    <section className="tab-grid">
      <article className="pitch-hero span-12">
        <div>
          <p className="eyebrow">Hackathon narrative</p>
          <h2>FairLens is an AI governance copilot for high-stakes decisions.</h2>
          <p>
            It transforms fairness from a hidden notebook metric into a product workflow:
            audit, explain, mitigate, review, report, and monitor.
          </p>
        </div>
      </article>
      {story.map((item) => (
        <article className="panel span-6 pitch-card" key={item.title}>
          <p className="eyebrow">{item.title}</p>
          <h2>{item.body}</h2>
        </article>
      ))}
      <article className="panel span-12">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">90-second judge flow</p>
            <h2>Use the Judge demo button in the sidebar to walk through the story.</h2>
          </div>
        </div>
        <div className="evidence-list">
          <div>Show unfair baseline risk in Command Center</div>
          <div>Show SHAP proxy-risk evidence in Audit Workbench</div>
          <div>Show before/after mitigation in Mitigation Lab</div>
          <div>Generate the AI Governance Report with optional Gemini</div>
          <div>Save a human review note and finish on Free Architecture</div>
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
