"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  fetchWasDetailManifest,
  fetchWasDetailPartition,
  fetchWasFeatures,
  formatEffect,
  formatP,
  type WasDetailAssociationRow,
  type WasDetailManifest,
  type WasDetailPartitionRef,
  type WasFeatureRecord,
} from "../atlas-data";
import { CONTRAST_LABELS } from "../atlas-state";
import {
  WAS_ANALYSES,
  WAS_FAMILY_LABELS,
  isWasFamily,
  type WasAnalysisId,
  type WasFamily,
} from "../was-config";
import { FeatureSearch } from "./FeatureSearch";

const MODELS = ["M1", "M2", "M3", "M4"] as const;
const SEVERITY_CONTRASTS = ["mild_vs_none", "moderate_vs_none", "severe_vs_none"] as const;
const CONTRAST_ORDER = [
  "severe_vs_none",
  "moderate_vs_none",
  "mild_vs_none",
  "trend",
  "ahi_ge15",
  "ahi_ge5",
  "omnibus",
];

type LoadedEvidence = {
  ref: WasDetailPartitionRef;
  row?: WasDetailAssociationRow;
};

type AnalysisEvidence = {
  analysisId: WasAnalysisId;
  window: string;
  contrast: string;
  primary?: LoadedEvidence;
  models: LoadedEvidence[];
  severity: LoadedEvidence[];
  warnings: string[];
};

type WasFeatureDetailProps = {
  initialFamily: string;
  initialKey: string;
  initialWindow?: string;
  initialContrast?: string;
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function preferredValue(values: string[], requested: string, fallbacks: string[]) {
  if (values.includes(requested)) return requested;
  return fallbacks.find((value) => values.includes(value)) ?? values[0] ?? requested;
}

function findFeatureRow(rows: WasDetailAssociationRow[], feature: WasFeatureRecord) {
  const exact = rows.find((row) => row.feature_key === feature.feature_key);
  if (exact) return exact;
  const idMatches = rows.filter((row) => row.feature_id === feature.feature_id);
  return idMatches.length === 1 ? idMatches[0] : undefined;
}

async function loadAnalysisEvidence(
  manifest: WasDetailManifest,
  feature: WasFeatureRecord,
  analysisId: WasAnalysisId,
  requestedWindow: string,
  requestedContrast: string,
): Promise<AnalysisEvidence> {
  const candidates = manifest.partitions.filter((partition) => partition.analysis_id === analysisId);
  if (!candidates.length) {
    return {
      analysisId,
      window: requestedWindow,
      contrast: requestedContrast,
      models: [],
      severity: [],
      warnings: ["No aggregate partitions are listed for this estimand."],
    };
  }

  const analysisWindows = unique(candidates.map((partition) => partition.window));
  const featureWindows = feature.windows.filter((value) => analysisWindows.includes(value));
  const windows = featureWindows.length ? featureWindows : analysisWindows;
  const window = preferredValue(windows, requestedWindow, ["1yr", "all", "lifetime", "5yr"]);
  const windowPartitions = candidates.filter((partition) => partition.window === window);
  const contrasts = unique(windowPartitions.map((partition) => partition.contrast));
  const contrast = preferredValue(contrasts, requestedContrast, ["severe_vs_none", "trend", "omnibus"]);
  const requestedPrimaryRef = windowPartitions.find((partition) =>
    partition.model === "M4" && partition.contrast === contrast
  ) ?? windowPartitions.find((partition) => partition.contrast === contrast);
  const requestedModelRefs = MODELS.flatMap((model) => {
    const match = windowPartitions.find((partition) =>
      partition.model === model && partition.contrast === contrast
    );
    return match ? [match] : [];
  });
  const severityRefs = SEVERITY_CONTRASTS.flatMap((severityContrast) => {
    const match = windowPartitions.find((partition) =>
      partition.model === "M4" && partition.contrast === severityContrast
    );
    return match ? [match] : [];
  });
  const m4Refs = windowPartitions.filter((partition) => partition.model === "M4");
  const initialRefs = unique([
    ...(requestedPrimaryRef ? [requestedPrimaryRef.path] : []),
    ...requestedModelRefs.map((ref) => ref.path),
    ...severityRefs.map((ref) => ref.path),
    ...m4Refs.map((ref) => ref.path),
  ]).map((path) => candidates.find((partition) => partition.path === path) as WasDetailPartitionRef);
  const loaded = new Map<string, LoadedEvidence>();
  const warnings: string[] = [];
  const loadRefs = async (refs: WasDetailPartitionRef[]) => {
    const pending = refs.filter((ref) => !loaded.has(ref.path));
    const settled = await Promise.allSettled(pending.map(fetchWasDetailPartition));
    settled.forEach((result, index) => {
      const ref = pending[index];
      if (result.status === "fulfilled") {
        loaded.set(ref.path, { ref: { ...ref, ...result.value.metadata }, row: findFeatureRow(result.value.rows, feature) });
      } else {
        warnings.push(`One ${ref.model} ${ref.contrast} partition could not be loaded.`);
      }
    });
  };
  await loadRefs(initialRefs);
  const evidenceFor = (ref: WasDetailPartitionRef | undefined) => ref
    ? loaded.get(ref.path) ?? { ref }
    : undefined;
  const contrastPreference = unique([
    contrast,
    requestedContrast,
    "severe_vs_none",
    "trend",
    "omnibus",
    ...contrasts,
  ]);
  const primary = evidenceFor(requestedPrimaryRef)?.row
    ? evidenceFor(requestedPrimaryRef)
    : contrastPreference.flatMap((candidateContrast) => {
      const ref = m4Refs.find((candidate) => candidate.contrast === candidateContrast);
      const item = evidenceFor(ref);
      return item?.row ? [item] : [];
    })[0];
  const resolvedContrast = primary?.ref.contrast ?? contrast;
  if (resolvedContrast !== contrast) {
    warnings.push(`${contrastLabel(contrast)} is unavailable for this feature; showing ${contrastLabel(resolvedContrast)} as the primary evidence.`);
  }
  const modelRefs = MODELS.flatMap((model) => {
    const match = windowPartitions.find((partition) =>
      partition.model === model && partition.contrast === resolvedContrast
    );
    return match ? [match] : [];
  });
  await loadRefs(modelRefs);

  return {
    analysisId,
    window,
    contrast: resolvedContrast,
    primary,
    models: modelRefs.map((ref) => evidenceFor(ref) as LoadedEvidence),
    severity: severityRefs.map((ref) => evidenceFor(ref) as LoadedEvidence),
    warnings,
  };
}

function contrastLabel(contrast: string) {
  return CONTRAST_LABELS[contrast] ?? contrast.replaceAll("_", " ");
}

function windowLabel(window: string) {
  if (window === "1yr") return "1 year pre-index";
  if (window === "5yr") return "5 years pre-index";
  if (window === "lifetime") return "Available lifetime history";
  if (window === "all") return "All applicable windows";
  return window;
}

function effectTypeLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "or") return "OR";
  if (normalized === "irr") return "IRR";
  if (normalized === "hr") return "HR";
  if (normalized === "beta" || normalized === "β") return "Beta";
  return value;
}

function releaseClass(status: string) {
  return /available|validated|approved|ready/i.test(status) ? "status-live" : "warning-badge";
}

function displayStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function prevalenceLabel(value: number) {
  return value >= 0 && value <= 1 ? `${(value * 100).toFixed(1)}%` : formatEffect(value);
}

function familyQcNote(family: WasFamily) {
  if (family === "behwas") {
    return "Behavioral outcomes are a curated, preliminary scan. Binary and continuous estimands remain separate, and adherence-source definitions require follow-up.";
  }
  if (family === "procwas") {
    return "Sleep-study, sleep-testing, and CPAP pathway procedures were excluded to reduce circular associations with the OSA exposure.";
  }
  if (family === "utilwas") {
    return "Utilization subgroups can overlap. Interpret each estimand separately and do not add counts across utilization families.";
  }
  return "Each block preserves its source estimand and effect scale; estimates are not pooled across analyses.";
}

function wasHref(feature: WasFeatureRecord, evidence: AnalysisEvidence) {
  const params = new URLSearchParams({
    family: feature.family,
    analysis: evidence.analysisId,
    window: evidence.window,
    model: "m4",
    contrast: evidence.contrast,
    view: feature.family === "behwas" ? "forest" : "manhattan",
    category: "all",
    significance: "all",
    stable: "0",
    feature: feature.feature_key,
  });
  return `/was?${params.toString()}`;
}

export function WasFeatureDetail({
  initialFamily,
  initialKey,
  initialWindow = "1yr",
  initialContrast = "severe_vs_none",
}: WasFeatureDetailProps) {
  const [feature, setFeature] = useState<WasFeatureRecord | null>(null);
  const [manifest, setManifest] = useState<WasDetailManifest | null>(null);
  const [preferredWindow, setPreferredWindow] = useState(initialWindow);
  const [contrast, setContrast] = useState(initialContrast);
  const [evidence, setEvidence] = useState<AnalysisEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect -- Loading state follows external registry and partition requests. */
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    if (!isWasFamily(initialFamily) || !initialKey) {
      setError("This cross-domain feature link is incomplete or invalid.");
      setLoading(false);
      return () => { active = false; };
    }
    Promise.all([fetchWasFeatures(), fetchWasDetailManifest()])
      .then(([features, nextManifest]) => {
        if (!active) return;
        const match = features.find((item) =>
          item.family === initialFamily && item.feature_key === initialKey
        ) ?? null;
        setFeature(match);
        setManifest(nextManifest);
        if (!match) setError("No aggregate feature matches this link.");
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Feature evidence could not be loaded.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialFamily, initialKey]);

  useEffect(() => {
    if (!feature || !manifest) return;
    let active = true;
    setLoading(true);
    setError("");
    Promise.all(unique(feature.analysis_ids).map((analysisId) =>
      loadAnalysisEvidence(manifest, feature, analysisId as WasAnalysisId, preferredWindow, contrast)
    ))
      .then((nextEvidence) => { if (active) setEvidence(nextEvidence); })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Feature evidence could not be loaded.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [feature, manifest, preferredWindow, contrast]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!feature) return;
    const params = new URLSearchParams({
      family: feature.family,
      key: feature.feature_key,
      window: preferredWindow,
      contrast,
    });
    window.history.replaceState(null, "", `/feature?${params.toString()}`);
  }, [feature, preferredWindow, contrast]);

  const featurePartitions = useMemo(() => {
    if (!feature || !manifest) return [];
    const ids = new Set(feature.analysis_ids);
    return manifest.partitions.filter((partition) => ids.has(partition.analysis_id));
  }, [feature, manifest]);
  const windows = useMemo(
    () => feature?.windows.length
      ? unique(feature.windows)
      : unique(featurePartitions.map((partition) => partition.window)),
    [feature, featurePartitions],
  );
  const contrasts = useMemo(() => {
    const values = unique(featurePartitions.map((partition) => partition.contrast));
    return values.sort((a, b) => {
      const ai = CONTRAST_ORDER.indexOf(a);
      const bi = CONTRAST_ORDER.indexOf(b);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
    });
  }, [featurePartitions]);
  const family = feature?.family ?? (isWasFamily(initialFamily) ? initialFamily : "labwas");

  return (
    <main className="feature-page was-feature-page page-shell">
      <div className="breadcrumbs">
        <Link href="/">Atlas</Link><span>/</span><Link href="/was">Other WAS analyses</Link><span>/</span><span>{feature?.feature_id ?? initialKey}</span>
      </div>

      <section className="feature-title">
        <div>
          <div className="section-kicker">Cross-domain feature</div>
          <div className="was-feature-title__badges">
            <span>{WAS_FAMILY_LABELS[family]}</span>
            <span>{feature?.code_system ?? "Feature"}</span>
            <code>{feature?.feature_id ?? initialKey}</code>
          </div>
          <h1>{feature?.feature_name ?? "Feature evidence"}</h1>
          <p>{feature?.category ?? "Aggregate clinical feature"}{feature?.subgroup ? ` · ${feature.subgroup}` : ""}</p>
        </div>
        <FeatureSearch compact />
      </section>

      <section className="was-feature-controls" aria-label="Preferred evidence dimensions">
        <div><span>Primary presentation</span><strong>M4 · Severe vs None · 1 year where available</strong></div>
        <label>Preferred window
          <select value={preferredWindow} onChange={(event) => setPreferredWindow(event.target.value)}>
            {!windows.includes(preferredWindow) ? <option value={preferredWindow}>{windowLabel(preferredWindow)} (fallback where unavailable)</option> : null}
            {windows.map((item) => <option key={item} value={item}>{windowLabel(item)}</option>)}
          </select>
        </label>
        <label>Preferred contrast
          <select value={contrast} onChange={(event) => setContrast(event.target.value)}>
            {!contrasts.includes(contrast) ? <option value={contrast}>{contrastLabel(contrast)} (fallback where unavailable)</option> : null}
            {contrasts.map((item) => <option key={item} value={item}>{contrastLabel(item)}</option>)}
          </select>
        </label>
      </section>

      {feature?.label_review_required ? (
        <p className="quality-warning was-feature-global-warning">This display label was mechanically derived and requires domain review before public release.</p>
      ) : null}
      {error ? <p className="plot-error" role="alert">{error}</p> : null}
      {loading ? <div className="plot-loading" role="status">Loading aggregate evidence…</div> : null}

      {!loading && feature ? (
        <section className="was-feature-estimands" aria-label="Feature estimands">
          {evidence.map((item) => (
            <EstimandBlock key={item.analysisId} feature={feature} evidence={item} />
          ))}
        </section>
      ) : null}

      {feature ? (
        <section className="was-feature-footnotes" aria-label="Interpretation and disclosure notes">
          <article><span>Family-specific QC</span><h2>Read within the source analysis</h2><p>{familyQcNote(feature.family)}</p></article>
          <article><span>Count interpretation</span><h2>Counts are not contrast cells</h2><p>Displayed counts are model-specific analytic N or overall feature-positive totals. They are not OSA exposure-by-outcome cells and are not used to infer suppressed subgroup counts.</p></article>
          <article><span>Research interpretation</span><h2>Association, not causation</h2><p>Results come from a sleep-clinic referral cohort. They do not estimate population prevalence and do not establish causal, protective, or independent effects.</p></article>
        </section>
      ) : null}
    </main>
  );
}

function EstimandBlock({ feature, evidence }: { feature: WasFeatureRecord; evidence: AnalysisEvidence }) {
  const config = WAS_ANALYSES[evidence.analysisId];
  const metadata = evidence.primary?.ref;
  const row = evidence.primary?.row;
  const warnings = unique([
    ...evidence.warnings,
    ...(metadata?.qc_warnings ?? []),
    ...(row?.unstable ? [`Estimate flagged as unstable${row.unstable_reason ? `: ${row.unstable_reason}` : "."}`] : []),
  ]);
  return (
    <article className="was-feature-estimand">
      <header className="was-feature-estimand__header">
        <div><span>{WAS_FAMILY_LABELS[feature.family]}</span><h2>{config?.label ?? evidence.analysisId}</h2><p>{config?.question ?? "Aggregate association estimand"}</p></div>
        {metadata ? <span className={releaseClass(metadata.release_status)}>{displayStatus(metadata.release_status)}</span> : null}
      </header>

      <div className="was-feature-primary-grid">
        <PrimaryEstimate evidence={evidence.primary} />
        <div className="was-feature-context">
          <dl>
            <div><dt>Window used</dt><dd>{windowLabel(evidence.window)}</dd></div>
            <div><dt>Contrast used</dt><dd>{contrastLabel(evidence.contrast)}</dd></div>
            <div><dt>Primary model</dt><dd>{metadata?.model ?? "M4 unavailable"}</dd></div>
            <div><dt>Effect scale</dt><dd>{metadata?.effect_scale ?? "Not available"}</dd></div>
            <div><dt>Coding system</dt><dd>{metadata?.code_system ?? feature.code_system}</dd></div>
          </dl>
          {metadata?.release_note ? <p>{metadata.release_note}</p> : null}
          <Link className="primary-link" href={wasHref(feature, evidence)}>Open this feature in the full scan →</Link>
        </div>
      </div>

      {warnings.map((warning) => <p className="quality-warning" key={warning}>{warning}</p>)}

      <div className="was-feature-comparisons">
        <ComparisonTable
          title="Adjustment ladder"
          description="The same contrast across the available M1-M4 models. Missing models are shown explicitly."
          entries={MODELS.map((model) => ({
            label: model,
            evidence: evidence.models.find((entry) => entry.ref.model === model),
          }))}
        />
        <ComparisonTable
          title="OSA severity comparisons"
          description="M4 estimates for Mild, Moderate, and Severe OSA versus the AHI <5 reference group, where available."
          entries={SEVERITY_CONTRASTS.map((contrast) => ({
            label: contrastLabel(contrast),
            evidence: evidence.severity.find((entry) => entry.ref.contrast === contrast),
          }))}
        />
      </div>
    </article>
  );
}

function PrimaryEstimate({ evidence }: { evidence?: LoadedEvidence }) {
  const metadata = evidence?.ref;
  const row = evidence?.row;
  const effectType = effectTypeLabel(metadata?.effect_type ?? row?.effect_type ?? "Effect");
  const showInterval = metadata?.directional !== false;
  return (
    <section className="was-feature-primary" aria-label="Primary fully adjusted estimate">
      <div><span>Primary fully adjusted evidence</span><strong>{effectType}</strong></div>
      {row ? (
        <>
          <div className="was-feature-primary__estimate"><b>{formatEffect(row.effect)}</b><span>{showInterval ? `${formatEffect(row.ci_low)}–${formatEffect(row.ci_high)} interval` : "Non-directional omnibus statistic"}</span></div>
          <dl>
            <div><dt>p-value</dt><dd>{formatP(row.p)}</dd></div>
            <div><dt>FDR</dt><dd>{row.sig_fdr ? "Significant" : "Not significant"}</dd></div>
            <div><dt>Bonferroni</dt><dd>{row.sig_bon ? "Significant" : "Not significant"}</dd></div>
            {row.n !== null ? <div><dt>{metadata?.sample_n_label ?? "Analytic N"}</dt><dd>{row.n.toLocaleString()}</dd></div> : null}
            {row.n_secondary !== null ? <div><dt>{metadata?.secondary_n_label ?? "Feature-positive N"}</dt><dd>{row.n_secondary.toLocaleString()}</dd></div> : null}
            {row.prevalence !== null ? <div><dt>Overall feature prevalence</dt><dd>{prevalenceLabel(row.prevalence)}</dd></div> : null}
          </dl>
          <p className="was-feature-count-note">Counts are analytic or overall feature-positive totals, not OSA exposure-by-outcome cells.</p>
        </>
      ) : <p>No estimate is available for this feature in the preferred partition.</p>}
    </section>
  );
}

function ComparisonTable({
  title,
  description,
  entries,
}: {
  title: string;
  description: string;
  entries: Array<{ label: string; evidence?: LoadedEvidence }>;
}) {
  const effectType = entries.find((entry) => entry.evidence)?.evidence?.ref.effect_type ?? "Effect";
  const showInterval = entries.find((entry) => entry.evidence)?.evidence?.ref.directional !== false;
  return (
    <section className="was-feature-comparison">
      <div><h3>{title}</h3><p>{description}</p></div>
      <div className="result-table-wrap">
        <table>
          <caption className="sr-only">{title}</caption>
          <thead><tr><th>Comparison</th><th>{effectTypeLabel(effectType)}</th>{showInterval ? <th>Interval</th> : null}<th>p-value</th><th>FDR</th><th>Quality</th></tr></thead>
          <tbody>
            {entries.map(({ label, evidence }) => {
              const row = evidence?.row;
              return (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className="numeric">{row ? formatEffect(row.effect) : "—"}</td>
                  {showInterval ? <td className="numeric">{row ? `${formatEffect(row.ci_low)}–${formatEffect(row.ci_high)}` : "Unavailable"}</td> : null}
                  <td className="numeric">{row ? formatP(row.p) : "—"}</td>
                  <td>{row ? (row.sig_fdr ? "Yes" : "No") : "—"}</td>
                  <td>{row ? (row.unstable ? <span className="warning-badge">Flagged</span> : <span className="quality-ok">Stable</span>) : <span className="muted">Not modeled</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
