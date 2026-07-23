"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchFeatures, fetchPartition, formatEffect, formatP, type AssociationRow, type FeatureRecord } from "../atlas-data";
import { CONTRAST_LABELS, type Analysis, type Model } from "../atlas-state";
import { FeatureSearch } from "./FeatureSearch";
import { PlotlyChart } from "./PlotlyChart";

const MODELS: Model[] = ["M1", "M2", "M3", "M4"];
const SEVERITY_CONTRASTS = ["mild_vs_none", "moderate_vs_none", "severe_vs_none"] as const;
const DETAIL_CONTRASTS = [...SEVERITY_CONTRASTS, "ahi_ge15", "ahi_ge5"] as const;

type ModelEvidence = { model: Model; row: AssociationRow };
type SeverityEvidence = { contrast: (typeof SEVERITY_CONTRASTS)[number]; row: AssociationRow };
type Evidence<T> = { prevalence: T[]; incidence: T[] };
type FeatureDetailProps = { initialCode: string; initialContrast: string };

function compatibleDetailContrast(contrast: string) {
  return (DETAIL_CONTRASTS as readonly string[]).includes(contrast) ? contrast : "severe_vs_none";
}

export function FeatureDetail({ initialCode, initialContrast }: FeatureDetailProps) {
  const [feature, setFeature] = useState<FeatureRecord | null>(null);
  const [contrast, setContrast] = useState(() => compatibleDetailContrast(initialContrast));
  const [evidence, setEvidence] = useState<Evidence<ModelEvidence>>({ prevalence: [], incidence: [] });
  const [severity, setSeverity] = useState<Evidence<SeverityEvidence>>({ prevalence: [], incidence: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect -- Loading state follows an external multi-partition request. */
  useEffect(() => {
    let active = true;
    fetchFeatures().then((features) => {
      if (!active) return;
      const match = features.find((item) => item.feature_id === initialCode) ?? null;
      setFeature(match);
      if (!match) setError(`No disease feature was found for PheCode ${initialCode}.`);
    }).catch(() => {
      if (active) setError("The disease feature index could not be loaded.");
    });
    return () => {
      active = false;
    };
  }, [initialCode]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      ...MODELS.map((model) => fetchPartition("prevalence", model, contrast)),
      ...MODELS.map((model) => fetchPartition("incidence", model, contrast)),
      ...SEVERITY_CONTRASTS.map((item) => fetchPartition("prevalence", "M4", item)),
      ...SEVERITY_CONTRASTS.map((item) => fetchPartition("incidence", "M4", item)),
    ]).then((partitions) => {
      if (!active) return;
      const find = (rows: AssociationRow[]) => rows.find((row) => row.feature_id === initialCode);
      const modelEvidence = (offset: number): ModelEvidence[] => MODELS.flatMap((model, index) => {
        const row = find(partitions[offset + index]);
        return row ? [{ model, row }] : [];
      });
      const severityEvidence = (offset: number): SeverityEvidence[] => SEVERITY_CONTRASTS.flatMap((item, index) => {
        const row = find(partitions[offset + index]);
        return row ? [{ contrast: item, row }] : [];
      });
      setEvidence({
        prevalence: modelEvidence(0),
        incidence: modelEvidence(4),
      });
      setSeverity({
        prevalence: severityEvidence(8),
        incidence: severityEvidence(11),
      });
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Feature evidence could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [initialCode, contrast]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const params = new URLSearchParams({ code: initialCode, contrast });
    window.history.replaceState(null, "", `/feature?${params.toString()}`);
  }, [initialCode, contrast]);

  const prevalenceM4 = evidence.prevalence.find(({ model }) => model === "M4")?.row;
  const incidenceM4 = evidence.incidence.find(({ model }) => model === "M4")?.row;
  const title = feature?.feature_name ?? `PheCode ${initialCode}`;

  return (
    <main className="feature-page page-shell">
      <div className="breadcrumbs"><Link href="/">Atlas</Link><span>/</span><Link href="/explore">Explore</Link><span>/</span><span>{initialCode}</span></div>
      <section className="feature-title">
        <div><div className="section-kicker">Disease feature</div><div className="feature-title__code">PheCode {initialCode}</div><h1>{title}</h1><p>{feature?.category ?? "Clinical phenotype"}</p></div>
        <FeatureSearch compact />
      </section>

      <section className="feature-primary" aria-label="Primary M4 evidence">
        <div className="feature-primary__intro">
          <span>Primary presentation</span><h2>{CONTRAST_LABELS[contrast] ?? contrast}</h2>
          <label>Contrast<select value={contrast} onChange={(event) => setContrast(event.target.value)}><option value="severe_vs_none">Severe vs None</option><option value="moderate_vs_none">Moderate vs None</option><option value="mild_vs_none">Mild vs None</option><option value="ahi_ge15">AHI ≥15 vs &lt;15</option><option value="ahi_ge5">AHI ≥5 vs &lt;5</option></select></label>
        </div>
        <PrimaryEvidenceCard analysis="prevalence" row={prevalenceM4} loading={loading} />
        <PrimaryEvidenceCard analysis="incidence" row={incidenceM4} loading={loading} />
      </section>

      {error ? <p className="plot-error" role="alert">{error}</p> : null}

      <section className="evidence-section" aria-labelledby="model-comparison-title">
        <div className="section-heading"><div><span>Adjustment ladder</span><h2 id="model-comparison-title">How the estimate changes from M1 to M4</h2></div><p>M4 is emphasized as the primary presentation model. M3 excludes BMI.</p></div>
        <div className="forest-grid">
          <EvidenceForest analysis="prevalence" rows={evidence.prevalence} />
          <EvidenceForest analysis="incidence" rows={evidence.incidence} />
        </div>
        <p className="method-callout">Attenuation between M3 and M4 may be scientifically informative because BMI can be conceptualized differently across questions. The atlas presents both estimates without assigning a causal role.</p>
      </section>

      <section className="evidence-section" aria-labelledby="severity-title">
        <div className="section-heading"><div><span>Dose pattern</span><h2 id="severity-title">M4 associations across OSA severity</h2></div><p>Each row compares an OSA severity group with AHI &lt;5 in the referred cohort.</p></div>
        <div className="severity-grid"><SeverityTable analysis="prevalence" rows={severity.prevalence} /><SeverityTable analysis="incidence" rows={severity.incidence} /></div>
      </section>

      <section className="definition-grid">
        <article><span>Prevalence PheDAS</span><h2>Existing disease evidence</h2><p>L1-regularized logistic models summarize disease presence before index. Odds ratios are shrunk and intervals are non-classical.</p><strong>Disclosure note</strong><p>Per-feature case counts are not present in the current combined output. Public data downloads remain disabled pending approved disclosure checks.</p></article>
        <article><span>Incidence PheDAS</span><h2>New-onset disease evidence</h2><p>Ridge cause-specific Cox models follow at-risk participants after index. Disease-specific at-risk and event counts, stability, and proportional-hazards diagnostics appear beside each result.</p><strong>Model note</strong><p>Incidence M3 also includes baseline encounter rate; model labels are analysis-specific.</p>{severity.incidence.some(({ row }) => row.sig_fdr) ? <Link href={`/survival?code=${encodeURIComponent(initialCode)}&view=severity`}>View cumulative-incidence curves →</Link> : null}</article>
        <article><span>Interpretation</span><h2>Association, not causation</h2><p>The reference is a symptomatic referral group. These estimates do not measure population OSA prevalence and should not be described as causal, protective, or independent risk effects.</p><Link href={`/explore?analysis=prevalence&contrast=${contrast}&model=m4&feature=${encodeURIComponent(initialCode)}`}>Return to this feature in the scan →</Link></article>
      </section>

      <section className="related-evidence" aria-labelledby="related-title"><div><span className="section-kicker">Separated by design</span><h2 id="related-title">Related cross-domain evidence</h2><p>Medication, laboratory, procedure, behavior, and utilization matches will appear here in the next release. They will be labeled as related evidence—not silently merged with this disease phenotype.</p></div><div className="related-tags"><span>LabWAS</span><span>MedWAS</span><span>ProcWAS</span><span>UtilWAS</span></div></section>
    </main>
  );
}

function PrimaryEvidenceCard({ analysis, row, loading }: { analysis: Analysis; row?: AssociationRow; loading: boolean }) {
  const prevalence = analysis === "prevalence";
  return <article className={`evidence-card evidence-card--${analysis}`}><div><span>{prevalence ? "Prevalence PheDAS" : "Incidence PheDAS"}</span><strong>{prevalence ? "Odds ratio" : "Hazard ratio"}</strong></div>{loading ? <p role="status">Loading evidence…</p> : row ? <><div className="evidence-card__estimate"><b>{formatEffect(row.effect)}</b><span>{formatEffect(row.ci_low)}–{formatEffect(row.ci_high)}</span></div><dl><div><dt>p-value</dt><dd>{formatP(row.p)}</dd></div><div><dt>FDR</dt><dd>{row.sig_fdr ? "Significant" : "Not significant"}</dd></div>{!prevalence ? <><div><dt>At risk</dt><dd>{row.n_atrisk?.toLocaleString() ?? "—"}</dd></div><div><dt>Events</dt><dd>{row.n_events?.toLocaleString() ?? "—"}</dd></div></> : null}</dl>{row.unstable ? <p className="quality-warning">Unstable estimate{row.unstable_reason ? `: ${row.unstable_reason}` : ""}</p> : null}{!prevalence && row.ph_p !== null && row.ph_p !== undefined && row.ph_p < 0.05 ? <p className="quality-warning">PH diagnostic p {formatP(row.ph_p)}</p> : null}</> : <p>No estimate is available for this contrast.</p>}</article>;
}

function EvidenceForest({ analysis, rows }: { analysis: Analysis; rows: ModelEvidence[] }) {
  const short = analysis === "prevalence" ? "OR" : "HR";
  const spec = useMemo(() => {
    const labels = rows.map(({ model }) => model);
    return {
      data: [{ type: "scatter", mode: "markers", x: rows.map(({ row }) => row.effect), y: labels, marker: { color: rows.map(({ model }) => model === "M4" ? "#075E5A" : "#A9B6B1"), size: rows.map(({ model }) => model === "M4" ? 12 : 9) }, error_x: { type: "data", symmetric: false, array: rows.map(({ row }) => Math.max(0, (row.ci_high ?? row.effect ?? 0) - (row.effect ?? 0))), arrayminus: rows.map(({ row }) => Math.max(0, (row.effect ?? 0) - (row.ci_low ?? row.effect ?? 0))), color: "#526560", thickness: 1.5 }, customdata: rows.map(({ row }) => [row.p, row.sig_fdr]), hovertemplate: `<b>%{y}</b><br>${short} %{x:.3f}<br>p %{customdata[0]:.2e}<extra></extra>` }],
      layout: { height: 320, margin: { l: 54, r: 24, t: 18, b: 54 }, paper_bgcolor: "#fff", plot_bgcolor: "#fff", showlegend: false, font: { family: "Inter, Arial, sans-serif", color: "#172422" }, xaxis: { type: "log", title: { text: short }, gridcolor: "#E6ECE8", zeroline: false }, yaxis: { categoryorder: "array", categoryarray: ["M4", "M3", "M2", "M1"] }, shapes: [{ type: "line", xref: "x", yref: "paper", x0: 1, x1: 1, y0: 0, y1: 1, line: { color: "#172422", width: 1 } }] },
    };
  }, [rows, short]);
  return <article className="forest-panel"><div><span>{analysis === "prevalence" ? "Prevalence" : "Incidence"}</span><h3>{analysis === "prevalence" ? "Odds ratios" : "Hazard ratios"}</h3></div>{rows.length ? <PlotlyChart data={spec.data} layout={spec.layout} ariaLabel={`${analysis} model comparison forest plot`} className="forest-plot" /> : <div className="plot-loading">Loading model comparison…</div>}</article>;
}

function SeverityTable({ analysis, rows }: { analysis: Analysis; rows: SeverityEvidence[] }) {
  const short = analysis === "prevalence" ? "OR" : "HR";
  return <article className="severity-panel"><div><span>{analysis === "prevalence" ? "Prevalence" : "Incidence"}</span><h3>{short} by severity</h3></div><table><caption className="sr-only">{analysis} M4 associations by OSA severity</caption><thead><tr><th>Contrast</th><th>{short}</th><th>Interval</th><th>FDR</th></tr></thead><tbody>{rows.map(({ contrast, row }) => <tr key={`${analysis}-${contrast}`}><th scope="row">{CONTRAST_LABELS[contrast]}</th><td>{formatEffect(row.effect)}</td><td>{formatEffect(row.ci_low)}–{formatEffect(row.ci_high)}</td><td>{row.sig_fdr ? "Yes" : "No"}</td></tr>)}</tbody></table></article>;
}
