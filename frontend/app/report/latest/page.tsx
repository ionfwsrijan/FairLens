import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type DatasetKey = "adult" | "german_credit";
type ProtectedAttribute = "sex" | "race" | "age_group";
type RoleKey = "Executive" | "ML Engineer" | "Compliance Reviewer" | "Auditor";

type AuditRun = {
  created_at: string;
  dataset?: DatasetKey;
  protected_attribute: ProtectedAttribute;
};

type PolicyCheck = {
  name: string;
  target: string;
  baseline: number;
  mitigated: number;
  status: "Pass" | "Review";
  owner: string;
};

type ReportSection = {
  title: string;
  body: string;
};

type AuditResponse = {
  generated_at: string;
  dataset: {
    key: DatasetKey;
    name: string;
    source: string;
    rows: number;
    protected_attribute: ProtectedAttribute;
  };
  baseline: {
    accuracy: number;
    demographic_parity_difference: number;
  };
  mitigated: {
    accuracy: number;
    demographic_parity_difference: number;
    demographic_parity_ratio: number;
  };
  comparison: {
    accuracy_delta: number;
    bias_reduction: number;
  };
  explainability: {
    insight: string;
    top_features: { feature: string; relative_importance: number; proxy_risk: string }[];
  };
  policy: PolicyCheck[];
  role_context: {
    role: RoleKey;
    priority: string;
    report_emphasis: string;
  };
  risk: {
    level: string;
  };
};

type GovernanceReport = {
  generated_at: string;
  source: string;
  google_product: string;
  ai: { enabled: boolean; provider: string; reason?: string };
  sections: ReportSection[];
};

const BACKEND_URL =
  process.env.FAIRLENS_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default async function LatestReportPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const pinnedDataset = paramValue(params.dataset) as DatasetKey | undefined;
  const pinnedAttribute = (paramValue(params.protected_attribute) ?? paramValue(params.attribute)) as
    | ProtectedAttribute
    | undefined;
  const role = ((paramValue(params.role) as RoleKey | undefined) ?? "Executive");
  const latestRun = !pinnedDataset || !pinnedAttribute ? await fetchLatestRun() : null;
  const dataset = pinnedDataset ?? latestRun?.dataset ?? "adult";
  const protectedAttribute = pinnedAttribute ?? latestRun?.protected_attribute ?? "sex";

  const result = await fetchReportBundle(dataset, protectedAttribute, role);

  if (!result.ok) {
    return (
      <main className="report-page">
        <section className="report-error">
          <p className="eyebrow">Shareable report</p>
          <h1>Report unavailable</h1>
          <p>{result.error}</p>
          <Link className="primary-button" href="/dashboard">Open dashboard</Link>
        </section>
      </main>
    );
  }

  const { audit, report } = result;
  const latestLabel = latestRun?.created_at ? new Date(latestRun.created_at).toLocaleString() : "Default audit";
  const shareHref = `/report/latest?dataset=${audit.dataset.key}&protected_attribute=${audit.dataset.protected_attribute}&role=${encodeURIComponent(audit.role_context.role)}`;

  return (
    <main className="report-page">
      <section className="report-hero">
        <div>
          <p className="eyebrow">Shareable governance report</p>
          <h1>FairLens audit evidence for {audit.dataset.name}</h1>
          <p>
            A read-only judge view covering baseline risk, mitigation outcome, policy gates, and explainability evidence.
          </p>
        </div>
        <div className="report-actions">
          <span>{report.ai.enabled ? report.ai.provider : "Local free report"}</span>
          <Link className="ghost-button" href={shareHref}>Pinned report link</Link>
          <Link className="primary-button" href="/dashboard">Open dashboard</Link>
        </div>
      </section>

      <section className="report-meta-strip">
        <div><span>Dataset</span><strong>{audit.dataset.name}</strong></div>
        <div><span>Protected audit</span><strong>{attributeLabel(audit.dataset.protected_attribute)}</strong></div>
        <div><span>Role lens</span><strong>{audit.role_context.role}</strong></div>
        <div><span>Risk</span><strong>{audit.risk.level}</strong></div>
        <div><span>Source</span><strong>{latestLabel}</strong></div>
      </section>

      <section className="report-grid">
        <ReportMetric label="Baseline accuracy" value={percent(audit.baseline.accuracy)} />
        <ReportMetric label="Baseline parity gap" value={percent(audit.baseline.demographic_parity_difference)} tone="danger" />
        <ReportMetric label="Mitigated gap" value={percent(audit.mitigated.demographic_parity_difference)} tone="good" />
        <ReportMetric label="Bias reduction" value={percent(audit.comparison.bias_reduction)} tone="good" />
      </section>

      <section className="report-two-column">
        <article className="report-panel">
          <p className="eyebrow">Policy gates</p>
          <h2>Deployment control status</h2>
          <div className="report-policy-table">
            {audit.policy.map((check) => (
              <div key={check.name}>
                <strong>{check.name}</strong>
                <span>{check.target}</span>
                <span>{check.name.toLowerCase().includes("ratio") ? number(check.mitigated, 2) : percent(check.mitigated)}</span>
                <em className={check.status === "Pass" ? "good" : "watch"}>{check.status}</em>
              </div>
            ))}
          </div>
        </article>

        <article className="report-panel">
          <p className="eyebrow">Explainability</p>
          <h2>Proxy-risk evidence</h2>
          <p>{audit.explainability.insight}</p>
          <div className="report-feature-list">
            {audit.explainability.top_features.slice(0, 5).map((feature) => (
              <div key={feature.feature}>
                <strong>{feature.feature}</strong>
                <span>{feature.proxy_risk} risk</span>
                <em>{percent(feature.relative_importance)} influence</em>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="report-section-list">
        {report.sections.map((section) => (
          <article className="report-section" key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function ReportMetric({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger" | "good";
}) {
  return (
    <article className={`report-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

async function fetchLatestRun() {
  try {
    const response = await fetch(new URL("/api/runs", BACKEND_URL), { cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as { runs?: AuditRun[] };
    const runs = payload.runs ?? [];
    return runs
      .filter((run) => run.dataset && run.protected_attribute)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchReportBundle(dataset: DatasetKey, protectedAttribute: ProtectedAttribute, role: RoleKey) {
  try {
    const auditUrl = new URL("/api/audit", BACKEND_URL);
    auditUrl.searchParams.set("dataset", dataset);
    auditUrl.searchParams.set("protected_attribute", protectedAttribute);
    auditUrl.searchParams.set("role", role);

    const reportUrl = new URL("/api/report", BACKEND_URL);
    reportUrl.searchParams.set("dataset", dataset);
    reportUrl.searchParams.set("protected_attribute", protectedAttribute);
    reportUrl.searchParams.set("role", role);
    reportUrl.searchParams.set("use_ai", "false");

    const [auditResponse, reportResponse] = await Promise.all([
      fetch(auditUrl, { cache: "no-store" }),
      fetch(reportUrl, { cache: "no-store" })
    ]);

    if (!auditResponse.ok) {
      throw new Error(`Audit API returned ${auditResponse.status}.`);
    }
    if (!reportResponse.ok) {
      throw new Error(`Report API returned ${reportResponse.status}.`);
    }

    return {
      ok: true as const,
      audit: (await auditResponse.json()) as AuditResponse,
      report: (await reportResponse.json()) as GovernanceReport
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unable to load the shareable report."
    };
  }
}

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function attributeLabel(attribute: ProtectedAttribute) {
  if (attribute === "sex") return "Gender";
  if (attribute === "race") return "Race";
  return "Age group";
}

function percent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${(value * 100).toFixed(digits)}%`;
}

function number(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return value.toFixed(digits);
}
