"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEffect, formatP } from "../atlas-data";
import {
  WAS_ANALYSES,
  WAS_ANALYSIS_IDS,
  WAS_FAMILIES,
  WAS_FAMILY_DEFAULT_ANALYSIS,
  WAS_FAMILY_LABELS,
  analysesForFamily,
  isDirectionalView,
  type WasAnalysisId,
  type WasFamily,
  type WasSignificance,
  type WasView,
} from "../was-config";
import {
  fetchWasManifest,
  fetchWasPartition,
  formatWasEffectType,
  isRatioPartition,
  selectWasPartition,
  type WasAssociationRow,
  type WasManifest,
  type WasPartitionMetadata,
  type WasPartitionRef,
} from "../was-data";
import {
  compatibleWasView,
  defaultWasStateForAnalysis,
  isOmnibusContrast,
  wasStateToSearch,
  type WasState,
} from "../was-state";
import { PlotlyChart } from "./PlotlyChart";
import { UtilizationProfile } from "./UtilizationProfile";

type WasExplorerProps = { initialState: WasState };
type ChartSpec = { data: unknown[]; layout: Record<string, unknown> };

const contrastLabels: Record<string, string> = {
  severe_vs_none: "Severe vs None",
  moderate_vs_none: "Moderate vs None",
  mild_vs_none: "Mild vs None",
  ahi_ge15: "AHI ≥15 vs <15",
  ahi_ge5: "AHI ≥5 vs <5",
  trend: "Severity trend",
  omnibus: "Any severity difference",
};

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function contrastLabel(value: string) {
  return contrastLabels[value] ?? humanize(value);
}

function windowLabel(value: string) {
  if (value === "all") return "All available time";
  if (value === "1yr") return "1 year";
  if (value === "5yr") return "5 years";
  if (value === "index") return "Closest pre-index questionnaire";
  return humanize(value);
}

function modelLabel(value: string) {
  const model = value.toUpperCase();
  if (model === "M4") return "M4 · primary";
  return model;
}

function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function pStrength(row: WasAssociationRow) {
  if (row.neglog10p !== null) return row.neglog10p;
  if (row.p === 0) return 300;
  if (row.p !== null && row.p > 0) return -Math.log10(row.p);
  return 0;
}

function sortByEvidence(rows: WasAssociationRow[]) {
  return [...rows].sort((a, b) => (a.p ?? 1) - (b.p ?? 1));
}

function sortForManhattan(rows: WasAssociationRow[]) {
  return [...rows].sort(
    (a, b) => a.category.localeCompare(b.category) ||
      a.feature_name.localeCompare(b.feature_name) ||
      a.feature_id.localeCompare(b.feature_id),
  );
}

function effectDirection(row: WasAssociationRow, metadata: WasPartitionMetadata) {
  if (!metadata.directional || row.effect === null) return 0;
  return row.effect >= metadata.neutral_value ? 1 : -1;
}

function markerSymbol(
  row: WasAssociationRow,
  metadata: WasPartitionMetadata,
) {
  if (row.unstable) return "x";
  if (!metadata.directional) return row.sig_fdr ? "circle" : "circle-open";
  const up = effectDirection(row, metadata) >= 0;
  if (row.sig_fdr) return up ? "triangle-up" : "triangle-down";
  return up ? "triangle-up-open" : "triangle-down-open";
}

function markerColor(row: WasAssociationRow, metadata: WasPartitionMetadata) {
  if (!metadata.directional) return "#526560";
  return effectDirection(row, metadata) >= 0 ? "#006B80" : "#7351A3";
}

function commonLayout(metadata: WasPartitionMetadata, view: WasView) {
  return {
    autosize: true,
    height: 520,
    margin: { l: 72, r: 26, t: 24, b: 92 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    hovermode: "closest",
    showlegend: false,
    font: {
      family: "Inter, Arial, sans-serif",
      color: "#172422",
      size: 12,
    },
    uirevision: `${metadata.analysis_id}-${metadata.window}-${metadata.model}-${metadata.contrast}-${view}`,
  } satisfies Record<string, unknown>;
}

function chartSpec(
  rows: WasAssociationRow[],
  view: WasView,
  metadata: WasPartitionMetadata,
  selected?: string,
): ChartSpec {
  const effectType = formatWasEffectType(metadata.effect_type);
  const ratio = isRatioPartition(metadata);
  const baseLayout = commonLayout(metadata, view);

  if (view === "forest") {
    const forestRows = sortByEvidence(rows)
      .filter((row) => row.effect !== null && (!ratio || (row.effect ?? 0) > 0))
      .slice(0, 35);
    const labels = forestRows.map((row) => `${row.feature_name} · ${row.feature_id}`);
    return {
      data: [{
        type: "scatter",
        mode: "markers",
        x: forestRows.map((row) => row.effect),
        y: labels,
        customdata: forestRows.map((row) => [
          row.feature_key,
          row.feature_name,
          row.feature_id,
          row.category,
          row.p,
        ]),
        marker: {
          color: forestRows.map((row) => markerColor(row, metadata)),
          symbol: forestRows.map((row) => markerSymbol(row, metadata)),
          size: forestRows.map((row) => row.feature_key === selected ? 13 : 9),
          line: { color: "#ffffff", width: 1 },
        },
        error_x: {
          type: "data",
          symmetric: false,
          array: forestRows.map((row) => Math.max(0, (row.ci_high ?? row.effect ?? 0) - (row.effect ?? 0))),
          arrayminus: forestRows.map((row) => Math.max(0, (row.effect ?? 0) - (row.ci_low ?? row.effect ?? 0))),
          color: "#526560",
          thickness: 1.3,
        },
        hovertemplate: `<b>%{customdata[1]}</b><br>${metadata.code_system} %{customdata[2]}` +
          `<br>${effectType} %{x:.3f}<br>p = %{customdata[4]:.2e}<extra></extra>`,
      }],
      layout: {
        ...baseLayout,
        height: Math.min(820, Math.max(440, forestRows.length * 24 + 100)),
        margin: { l: 250, r: 30, t: 20, b: 58 },
        xaxis: {
          type: ratio ? "log" : "linear",
          title: { text: effectType },
          gridcolor: "#E6ECE8",
          zeroline: false,
        },
        yaxis: {
          categoryorder: "array",
          categoryarray: [...labels].reverse(),
          tickfont: { size: 10 },
        },
        shapes: [{
          type: "line",
          xref: "x",
          yref: "paper",
          x0: metadata.neutral_value,
          x1: metadata.neutral_value,
          y0: 0,
          y1: 1,
          line: { color: "#172422", width: 1 },
        }],
      },
    };
  }

  const ordered = sortForManhattan(rows);
  const customdata = ordered.map((row) => [
    row.feature_key,
    row.feature_name,
    row.feature_id,
    row.category,
    row.subgroup,
    row.effect,
    row.ci_low,
    row.ci_high,
    row.p,
  ]);
  const colors = ordered.map((row) => markerColor(row, metadata));
  const symbols = ordered.map((row) => markerSymbol(row, metadata));
  const sizes = ordered.map((row) => row.feature_key === selected ? 13 : row.sig_fdr ? 8 : 7);
  const outlines = ordered.map((row, index) => row.feature_key === selected
    ? "#172422"
    : row.sig_fdr ? "#ffffff" : colors[index]);
  const commonTrace = {
    type: "scatter",
    mode: "markers",
    customdata,
    marker: {
      color: colors,
      symbol: symbols,
      size: sizes,
      opacity: 0.84,
      line: { color: outlines, width: 1.4 },
    },
    hovertemplate: `<b>%{customdata[1]}</b><br>${metadata.code_system} %{customdata[2]} · %{customdata[3]}` +
      `<br>${effectType} %{customdata[5]:.3f}` +
      (metadata.directional
        ? ` (%{customdata[6]:.3f}–%{customdata[7]:.3f})`
        : "") +
      `<br>p = %{customdata[8]:.2e}<extra></extra>`,
  };

  if (view === "volcano") {
    const directional = ordered.filter((row) =>
      row.effect !== null && (!ratio || (row.effect ?? 0) > 0),
    );
    const indexByKey = new Map(ordered.map((row, index) => [row.feature_key, index]));
    const indices = directional.map((row) => indexByKey.get(row.feature_key) ?? 0);
    return {
      data: [{
        ...commonTrace,
        x: directional.map((row) => ratio ? Math.log(row.effect ?? 1) : row.effect),
        y: directional.map(pStrength),
        customdata: indices.map((index) => customdata[index]),
        marker: {
          color: indices.map((index) => colors[index]),
          symbol: indices.map((index) => symbols[index]),
          size: indices.map((index) => sizes[index]),
          opacity: 0.84,
          line: { color: indices.map((index) => outlines[index]), width: 1.4 },
        },
      }],
      layout: {
        ...baseLayout,
        xaxis: {
          title: { text: ratio ? `log(${effectType})` : effectType },
          zeroline: true,
          zerolinecolor: "#172422",
          gridcolor: "#E6ECE8",
        },
        yaxis: {
          title: { text: "−log₁₀(p-value)" },
          gridcolor: "#E6ECE8",
          rangemode: "tozero",
        },
      },
    };
  }

  const groups = new Map<string, { start: number; end: number }>();
  ordered.forEach((row, index) => {
    const current = groups.get(row.category);
    groups.set(row.category, current
      ? { start: current.start, end: index }
      : { start: index, end: index });
  });
  const tickvals: number[] = [];
  const ticktext: string[] = [];
  const shapes: Record<string, unknown>[] = [];
  [...groups.entries()].forEach(([category, bounds], index) => {
    tickvals.push((bounds.start + bounds.end) / 2);
    ticktext.push(category);
    if (index % 2 === 0) {
      shapes.push({
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: bounds.start - 0.5,
        x1: bounds.end + 0.5,
        y0: 0,
        y1: 1,
        fillcolor: "#F4F6F2",
        line: { width: 0 },
        layer: "below",
      });
    }
  });
  return {
    data: [{
      ...commonTrace,
      x: ordered.map((_, index) => index),
      y: ordered.map(pStrength),
    }],
    layout: {
      ...baseLayout,
      shapes,
      xaxis: {
        tickmode: "array",
        tickvals,
        ticktext,
        tickangle: -28,
        tickfont: { size: 10 },
        showgrid: false,
        zeroline: false,
      },
      yaxis: {
        title: { text: "−log₁₀(p-value)" },
        gridcolor: "#E6ECE8",
        rangemode: "tozero",
      },
    },
  };
}

function releaseClass(status: string) {
  return /available|validated|approved|ready/i.test(status)
    ? "status-live"
    : "warning-badge";
}

function stateMatchesPartition(state: WasState, partition: WasPartitionRef) {
  return state.analysis === partition.analysis_id &&
    state.family === partition.family &&
    state.window === partition.window &&
    state.model.toUpperCase() === partition.model.toUpperCase() &&
    state.contrast === partition.contrast;
}

export function WasExplorer({ initialState }: WasExplorerProps) {
  const [state, setState] = useState(initialState);
  const [manifest, setManifest] = useState<WasManifest | null>(null);
  const [metadata, setMetadata] = useState<WasPartitionMetadata | null>(null);
  const [rows, setRows] = useState<WasAssociationRow[]>([]);
  const [manifestLoading, setManifestLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchWasManifest()
      .then((nextManifest) => {
        if (active) setManifest(nextManifest);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "The WAS manifest could not be loaded.");
      })
      .finally(() => {
        if (active) setManifestLoading(false);
      });
    return () => { active = false; };
  }, []);

  const partition = useMemo(
    () => manifest ? selectWasPartition(manifest, state) : undefined,
    [manifest, state],
  );

  /* eslint-disable react-hooks/set-state-in-effect -- State is reconciled to the externally loaded manifest. */
  useEffect(() => {
    if (!partition || stateMatchesPartition(state, partition)) return;
    setState((current) => ({
      ...current,
      family: partition.family,
      analysis: partition.analysis_id,
      window: partition.window,
      model: partition.model,
      contrast: partition.contrast,
      view: compatibleWasView(current.view, partition.contrast, partition.directional),
      category: "all",
      feature: undefined,
    }));
  }, [partition, state]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadablePartition = partition && stateMatchesPartition(state, partition)
    ? partition
    : undefined;

  /* eslint-disable react-hooks/set-state-in-effect -- Loading state follows an external partition request. */
  useEffect(() => {
    if (!loadablePartition) return;
    let active = true;
    setLoading(true);
    setError("");
    setRows([]);
    fetchWasPartition(loadablePartition)
      .then((payload) => {
        if (!active) return;
        setMetadata(payload.metadata);
        setRows(payload.rows);
        const strongest = sortByEvidence(payload.rows)[0];
        setState((current) => {
          const requested = current.feature && payload.rows.some(
            (row) => row.feature_key === current.feature || row.feature_id === current.feature,
          );
          return requested || !strongest
            ? current
            : { ...current, feature: strongest.feature_key };
        });
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Association data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [loadablePartition]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    window.history.replaceState(null, "", `/was?${wasStateToSearch(state)}`);
  }, [state]);

  const manifestAnalysisIds = useMemo(() => new Set(
    manifest?.analyses.map((analysis) => analysis.analysis_id) ?? WAS_ANALYSIS_IDS,
  ), [manifest]);
  const availableFamilies = WAS_FAMILIES.filter((family) =>
    analysesForFamily(family).some((analysis) => manifestAnalysisIds.has(analysis.id)),
  );
  const familyAnalyses = analysesForFamily(state.family).filter((analysis) =>
    manifestAnalysisIds.has(analysis.id),
  );
  const analysisPartitions = manifest?.partitions.filter(
    (candidate) => candidate.analysis_id === state.analysis,
  ) ?? [];
  const windows = unique(analysisPartitions.map((candidate) => candidate.window));
  const models = unique(analysisPartitions.map((candidate) => candidate.model.toUpperCase()));
  const contrasts = unique(analysisPartitions.map((candidate) => candidate.contrast));
  const categories = useMemo(
    () => unique(rows.map((row) => row.category)),
    [rows],
  );

  const visibleRows = useMemo(() => rows.filter((row) => {
    if (state.stableOnly && row.unstable) return false;
    if (state.category !== "all" && row.category !== state.category) return false;
    if (state.significance === "fdr" && !row.sig_fdr) return false;
    if (state.significance === "bonferroni" && !row.sig_bon) return false;
    const needle = state.query.trim().toLowerCase();
    return !needle || [
      row.feature_key,
      row.feature_id,
      row.feature_name,
      row.category,
      row.subgroup,
    ].some((value) => value.toLowerCase().includes(needle));
  }), [rows, state.stableOnly, state.category, state.significance, state.query]);
  const rankedRows = useMemo(() => sortByEvidence(visibleRows), [visibleRows]);
  const selected = rows.find((row) =>
    row.feature_key === state.feature || row.feature_id === state.feature,
  ) ?? rankedRows[0];
  const activeMetadata = metadata ?? partition ?? null;
  const directional = activeMetadata?.directional !== false && !isOmnibusContrast(state.contrast);
  const selectedView = compatibleWasView(state.view, state.contrast, directional);
  const spec = useMemo(
    () => activeMetadata
      ? chartSpec(visibleRows, selectedView, activeMetadata, selected?.feature_key)
      : { data: [], layout: {} },
    [activeMetadata, visibleRows, selectedView, selected?.feature_key],
  );
  const effectType = activeMetadata
    ? formatWasEffectType(activeMetadata.effect_type)
    : "Effect";
  const analysisConfig = WAS_ANALYSES[state.analysis];
  const fdrCount = visibleRows.filter((row) => row.sig_fdr).length;

  const updateState = <K extends keyof WasState>(key: K, value: WasState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  };
  const changeFamily = (family: WasFamily) => {
    const available = analysesForFamily(family).find((analysis) =>
      manifestAnalysisIds.has(analysis.id),
    );
    const analysis = available?.id ?? WAS_FAMILY_DEFAULT_ANALYSIS[family];
    setState(defaultWasStateForAnalysis(analysis));
  };
  const changeAnalysis = (analysis: WasAnalysisId) => {
    setState(defaultWasStateForAnalysis(analysis));
  };
  const selectPoint = useCallback((point: Record<string, unknown>) => {
    const customdata = Array.isArray(point.customdata) ? point.customdata : [];
    const featureKey = String(customdata[0] ?? "");
    if (featureKey) setState((current) => ({ ...current, feature: featureKey }));
  }, []);

  const viewTitle = selectedView === "volcano"
    ? `${effectType} and significance`
    : selectedView === "forest"
      ? "Strongest directional estimates"
      : selectedView === "table"
        ? "Ranked association results"
        : "Association-wide significance landscape";

  return (
    <main className="explorer was-explorer page-shell">
      <div className="breadcrumbs"><Link href="/">Atlas</Link><span>/</span><span>Other WAS analyses</span></div>
      <header className="explorer__header">
        <div><div className="section-kicker">Cross-domain association scan</div><h1>{analysisConfig.label}</h1></div>
        <p>{analysisConfig.question}</p>
      </header>

      <section className="analysis-builder" aria-labelledby="was-builder-title">
        <h2 id="was-builder-title" className="sr-only">Analysis settings</h2>
        <div className="analysis-sentence">
          <span>Show</span>
          <label><span className="sr-only">Analysis family</span><select value={state.family} onChange={(event) => changeFamily(event.target.value as WasFamily)}>{availableFamilies.map((family) => <option key={family} value={family}>{WAS_FAMILY_LABELS[family]}</option>)}</select></label>
          <label><span className="sr-only">Analysis target</span><select value={state.analysis} onChange={(event) => changeAnalysis(event.target.value as WasAnalysisId)}>{familyAnalyses.map((analysis) => <option key={analysis.id} value={analysis.id}>{analysis.shortLabel}</option>)}</select></label>
          <span>within</span>
          <label><span className="sr-only">Time window</span><select value={state.window} onChange={(event) => updateState("window", event.target.value)}>{windows.map((window) => <option key={window} value={window}>{windowLabel(window)}</option>)}</select></label>
          <span>for</span>
          <label><span className="sr-only">OSA contrast</span><select value={state.contrast} onChange={(event) => updateState("contrast", event.target.value)}>{contrasts.map((contrast) => <option key={contrast} value={contrast}>{contrastLabel(contrast)}</option>)}</select></label>
          <span>with</span>
          <label><span className="sr-only">Adjustment model</span><select value={state.model} onChange={(event) => updateState("model", event.target.value)}>{models.map((model) => <option key={model} value={model}>{modelLabel(model)}</option>)}</select></label>
          <span>across</span>
          <label><span className="sr-only">Feature category</span><select value={state.category} onChange={(event) => updateState("category", event.target.value)}><option value="all">all categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        </div>
        <div className="secondary-controls">
          <label>Significance<select value={state.significance} onChange={(event) => updateState("significance", event.target.value as WasSignificance)}><option value="all">All results</option><option value="fdr">FDR-significant</option><option value="bonferroni">Bonferroni-significant</option></select></label>
          <label>Find in scan<input value={state.query} onChange={(event) => updateState("query", event.target.value)} placeholder={`Name or ${activeMetadata?.code_system ?? "feature code"}`} /></label>
          <label className="check-control"><input type="checkbox" checked={state.stableOnly} onChange={(event) => updateState("stableOnly", event.target.checked)} />Stable estimates only</label>
          <button className="text-button" type="button" onClick={() => setState(defaultWasStateForAnalysis(state.analysis))}>Reset</button>
        </div>
        <p className="cohort-note">M4 and Severe vs None are the primary defaults where available. Model IDs retain their family-specific source definitions. Each selection loads one homogeneous estimand; unlike effect measures never share an axis. Multiplicity badges preserve the source analysis flags; the browser does not recompute thresholds after filtering.</p>
      </section>

      {activeMetadata ? <section className="was-release-note" aria-label="Analysis release status"><span className={releaseClass(activeMetadata.release_status)}>{humanize(activeMetadata.release_status)}</span><p><strong>{activeMetadata.label}</strong>{activeMetadata.release_note ? ` · ${activeMetadata.release_note}` : ""}</p></section> : null}

      {state.family === "utilwas" ? <UtilizationProfile profileRef={manifest?.utilization_profile} manifestLoading={manifestLoading} window={state.window} /> : null}

      <section className="scan-summary" aria-label="Current scan summary">
        <div><strong>{visibleRows.length.toLocaleString()}</strong><span>features displayed</span></div>
        <div><strong>{fdrCount.toLocaleString()}</strong><span>FDR-significant</span></div>
        <div><strong>{selected?.feature_name ?? "None"}</strong><span>selected feature</span></div>
      </section>

      <div className="view-tabs" role="group" aria-label="Result view">
        {(["manhattan", "volcano", "forest", "table"] as WasView[]).map((view) => {
          const disabled = !directional && isDirectionalView(view);
          return <button key={view} type="button" aria-pressed={selectedView === view} disabled={disabled} title={disabled ? "This non-directional analysis supports Manhattan and table views only" : undefined} onClick={() => updateState("view", view)}>{view[0].toUpperCase() + view.slice(1)}</button>;
        })}
        {directional ? <span className="marker-key"><i className="marker marker--higher" />Above null<i className="marker marker--lower" />Below null<i className="marker marker--open" />Not FDR-significant</span> : <span className="marker-key">Omnibus · non-directional</span>}
      </div>

      <div className="explorer-grid">
        <section className="plot-panel" aria-labelledby="was-plot-title">
          <div className="panel-heading"><div><span>{contrastLabel(state.contrast)} · {windowLabel(state.window)}</span><h2 id="was-plot-title">{viewTitle}</h2></div><button type="button" disabled title="Pending disclosure review">CSV pending review</button></div>
          {error ? <div className="plot-error" role="alert">{error}</div> : manifestLoading || loading ? <div className="plot-loading" role="status">Loading aggregate results…</div> : selectedView === "table" ? <WasResultTable rows={rankedRows} metadata={activeMetadata} selected={selected?.feature_key} onSelect={(feature) => updateState("feature", feature)} /> : <PlotlyChart data={spec.data} layout={spec.layout} ariaLabel={`${analysisConfig.label} ${selectedView} plot. Use the synchronized table for keyboard access.`} className={selectedView === "forest" ? "forest-plot" : undefined} onPointClick={selectPoint} />}
        </section>

        <aside className="feature-inspector" aria-labelledby="was-selected-feature-title">
          {selected && activeMetadata ? <>
            <span className="inspector-label">Selected feature</span><code>{activeMetadata.code_system} {selected.feature_id}</code><h2 id="was-selected-feature-title">{selected.feature_name}</h2><p className="inspector-category">{selected.category}{selected.subgroup ? ` · ${selected.subgroup}` : ""}</p>
            <div className="primary-estimate"><span>{effectType}</span><strong>{formatEffect(selected.effect)}</strong><small>{activeMetadata.directional ? `${formatEffect(selected.ci_low)}–${formatEffect(selected.ci_high)} interval · null ${activeMetadata.neutral_value}` : "Non-directional omnibus statistic"}</small><small>Scale: {activeMetadata.effect_scale}</small></div>
            <dl><div><dt>p-value</dt><dd>{formatP(selected.p)}</dd></div><div><dt>FDR</dt><dd>{selected.sig_fdr ? "Significant" : "Not significant"}</dd></div><div><dt>{activeMetadata.sample_n_label}</dt><dd>{selected.n?.toLocaleString() ?? "—"}</dd></div>{selected.n_secondary !== null ? <div><dt>{activeMetadata.secondary_n_label || "Feature-positive N"}</dt><dd>{selected.n_secondary.toLocaleString()}</dd></div> : null}{selected.prevalence !== null ? <div><dt>Overall feature prevalence</dt><dd>{selected.prevalence >= 0 && selected.prevalence <= 1 ? `${(selected.prevalence * 100).toFixed(1)}%` : formatEffect(selected.prevalence)}</dd></div> : null}</dl>
            {selected.unstable ? <p className="quality-warning">Estimate flagged as unstable{selected.unstable_reason ? `: ${selected.unstable_reason}` : "."}</p> : null}
            {selected.referral_item ? <p className="quality-warning">Ascertainment-sensitive item: this response can help drive sleep-study referral, so the association may partly reflect the referral pathway.</p> : null}
            {selected.label_review_required ? <p className="quality-warning">The display name is a conservative concept label and remains under review; the source feature code is shown above.</p> : null}
            {selected.n !== null || selected.n_secondary !== null ? <p className="was-feature-count-note">{state.family === "qwas" ? "This is the itemwise answered N supplied to the source model, not a model-specific fitted N after covariate missingness." : "These are analytic or overall feature-positive counts, not OSA exposure-by-outcome cells."}</p> : null}
            <p className="was-estimand-note">{effectType} is interpreted only within {analysisConfig.shortLabel.toLowerCase()}; it is not combined with other WAS effect measures.</p>
            <Link className="primary-link" href={`/feature?family=${activeMetadata.family}&key=${encodeURIComponent(selected.feature_key)}&analysis=${activeMetadata.analysis_id}&window=${activeMetadata.window}&contrast=${activeMetadata.contrast}`}>Open full feature page →</Link>
          </> : <p>Select a point or table row to inspect it.</p>}
        </aside>
      </div>

      {selectedView !== "table" ? <section className="table-section"><div className="panel-heading"><div><span>Keyboard-accessible companion</span><h2>Association results</h2></div><p>Showing the 60 strongest displayed results</p></div><WasResultTable rows={rankedRows} metadata={activeMetadata} selected={selected?.feature_key} onSelect={(feature) => updateState("feature", feature)} limit={60} /></section> : null}
      <p className="research-preview-note">Research preview. Aggregate associations describe relationships within a sleep-clinic referral cohort; they do not establish causality or describe population OSA prevalence. Family-specific release and disclosure status remains visible above each scan.</p>
      <div className="sr-only" aria-live="polite">{selected ? `Selected ${selected.feature_name}, ${selected.feature_id}` : `${visibleRows.length} results`}</div>
    </main>
  );
}

function WasResultTable({
  rows,
  metadata,
  selected,
  onSelect,
  limit = 100,
}: {
  rows: WasAssociationRow[];
  metadata: WasPartitionMetadata | null;
  selected?: string;
  onSelect: (feature: string) => void;
  limit?: number;
}) {
  const effectType = metadata ? formatWasEffectType(metadata.effect_type) : "Effect";
  const showInterval = metadata?.directional !== false;
  return <div className="result-table-wrap"><table className="result-table"><caption className="sr-only">Ranked WAS association results</caption><thead><tr><th>Feature</th><th>Category</th><th>{effectType}{showInterval ? " (interval)" : ""}</th><th>p-value</th><th>{metadata?.sample_n_label ?? "Analytic N"}</th><th>Significance</th><th>Quality</th></tr></thead><tbody>{rows.slice(0, limit).map((row) => <tr key={row.feature_key} className={row.feature_key === selected ? "is-selected" : ""}><th scope="row"><button type="button" onClick={() => onSelect(row.feature_key)}><strong>{row.feature_name}</strong><code>{metadata?.code_system ?? "Code"} {row.feature_id}</code></button></th><td>{row.category}{row.subgroup ? <small className="was-table-subgroup">{row.subgroup}</small> : null}</td><td className="numeric">{formatEffect(row.effect)}{showInterval ? <small> ({formatEffect(row.ci_low)}–{formatEffect(row.ci_high)})</small> : null}</td><td className="numeric">{formatP(row.p)}</td><td className="numeric">{row.n?.toLocaleString() ?? "—"}</td><td>{row.sig_bon ? <span className="sig-badge sig-badge--bon">Bonf.</span> : row.sig_fdr ? <span className="sig-badge">FDR</span> : <span className="muted">—</span>}</td><td>{row.unstable || row.label_review_required ? <span className="warning-badge">Review</span> : row.referral_item ? <span className="warning-badge">Ascertainment</span> : <span className="quality-ok">Stable</span>}</td></tr>)}</tbody></table></div>;
}
