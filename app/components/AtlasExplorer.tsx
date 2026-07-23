"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchPartition, formatEffect, formatP, type AssociationRow } from "../atlas-data";
import {
  CONTRAST_LABELS,
  CONTRASTS,
  MODEL_LABELS,
  atlasStateToSearch,
  type AtlasState,
  type Analysis,
  type Model,
  type View,
} from "../atlas-state";
import { PlotlyChart } from "./PlotlyChart";

const CATEGORY_ORDER = [
  "circulatory system", "endocrine/metabolic", "respiratory", "neurological",
  "digestive", "genitourinary", "hematopoietic", "mental disorders",
  "musculoskeletal", "infectious diseases", "neoplasms", "sense organs",
  "dermatologic", "injuries & poisonings", "pregnancy complications",
  "congenital anomalies", "symptoms", "other",
];

const effectName = (analysis: Analysis) => analysis === "prevalence" ? "Odds ratio" : "Hazard ratio";
const effectShort = (analysis: Analysis) => analysis === "prevalence" ? "OR" : "HR";
const analysisName = (analysis: Analysis) => analysis === "prevalence" ? "Prevalence PheDAS" : "Incidence PheDAS";

function compatibleState(state: AtlasState): AtlasState {
  const contrast = CONTRASTS[state.analysis].includes(state.contrast)
    ? state.contrast
    : CONTRASTS[state.analysis][0];
  return {
    ...state,
    contrast,
    view: contrast === "omnibus" && state.view === "volcano" ? "manhattan" : state.view,
  };
}

function sortForPlot(rows: AssociationRow[]) {
  return [...rows].sort((a, b) => {
    const aCategory = CATEGORY_ORDER.indexOf(a.category);
    const bCategory = CATEGORY_ORDER.indexOf(b.category);
    const categoryDelta = (aCategory < 0 ? 999 : aCategory) - (bCategory < 0 ? 999 : bCategory);
    return categoryDelta || a.feature_name.localeCompare(b.feature_name);
  });
}

function chartSpec(rows: AssociationRow[], view: View, analysis: Analysis, totalTests: number, selected?: string) {
  const ordered = sortForPlot(rows);
  const groups = new Map<string, { start: number; end: number }>();
  ordered.forEach((row, index) => {
    const current = groups.get(row.category);
    groups.set(row.category, current ? { start: current.start, end: index } : { start: index, end: index });
  });

  const customdata = ordered.map((row) => [
    row.feature_id, row.feature_name, row.category, row.effect, row.ci_low, row.ci_high,
    row.p, row.sig_fdr, row.sig_bon, row.unstable, row.ph_p, row.n_events, row.n_atrisk,
  ]);
  const colors = ordered.map((row) => row.effect !== null && row.effect >= 1 ? "#006B80" : "#7351A3");
  const symbols = ordered.map((row) => {
    const up = row.effect !== null && row.effect >= 1;
    if (row.unstable) return "x";
    if (row.sig_fdr) return up ? "triangle-up" : "triangle-down";
    return up ? "triangle-up-open" : "triangle-down-open";
  });
  const sizes = ordered.map((row) => row.feature_id === selected ? 13 : row.sig_fdr ? 8 : 7);
  const outlines = ordered.map((row, index) => row.feature_id === selected ? "#172422" : row.sig_fdr ? "#ffffff" : colors[index]);

  const commonTrace = {
    type: "scatter",
    mode: "markers",
    customdata,
    marker: { color: colors, symbol: symbols, size: sizes, opacity: 0.84, line: { color: outlines, width: 1.4 } },
    hovertemplate:
      `<b>%{customdata[1]}</b><br>PheCode %{customdata[0]} · %{customdata[2]}` +
      `<br>${effectShort(analysis)} %{customdata[3]:.3f} (%{customdata[4]:.3f}–%{customdata[5]:.3f})` +
      `<br>p = %{customdata[6]:.2e}<extra></extra>`,
  };

  const baseLayout: Record<string, unknown> = {
    autosize: true,
    height: 520,
    margin: { l: 70, r: 26, t: 24, b: 92 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    hovermode: "closest",
    showlegend: false,
    font: { family: "Inter, Arial, sans-serif", color: "#172422", size: 12 },
    uirevision: `${analysis}-${view}`,
  };

  if (view === "volcano") {
    const directional = ordered.filter((row) => row.effect !== null && row.effect > 0);
    const indexById = new Map(ordered.map((row, index) => [row.feature_id, index]));
    const indices = directional.map((row) => indexById.get(row.feature_id) ?? 0);
    return {
      data: [{
        ...commonTrace,
        x: directional.map((row) => Math.log(row.effect ?? 1)),
        y: directional.map((row) => row.neglog10p ?? 0),
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
        xaxis: { title: { text: `log(${effectShort(analysis)})` }, zeroline: true, zerolinecolor: "#172422", gridcolor: "#E6ECE8" },
        yaxis: { title: { text: "−log₁₀(p-value)" }, gridcolor: "#E6ECE8", rangemode: "tozero" },
      },
    };
  }

  const tickvals: number[] = [];
  const ticktext: string[] = [];
  const shapes: Record<string, unknown>[] = [];
  [...groups.entries()].forEach(([category, bounds], index) => {
    tickvals.push((bounds.start + bounds.end) / 2);
    ticktext.push(category);
    if (index % 2 === 0) shapes.push({ type: "rect", xref: "x", yref: "paper", x0: bounds.start - 0.5, x1: bounds.end + 0.5, y0: 0, y1: 1, fillcolor: "#F4F6F2", line: { width: 0 }, layer: "below" });
  });
  const bonferroni = -Math.log10(0.05 / Math.max(totalTests, 1));
  shapes.push({ type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: bonferroni, y1: bonferroni, line: { color: "#955500", width: 1.2, dash: "dot" } });

  return {
    data: [{ ...commonTrace, x: ordered.map((_, index) => index), y: ordered.map((row) => row.neglog10p ?? 0) }],
    layout: {
      ...baseLayout,
      shapes,
      xaxis: { tickmode: "array", tickvals, ticktext, tickangle: -28, tickfont: { size: 10 }, fixedrange: false, showgrid: false, zeroline: false },
      yaxis: { title: { text: "−log₁₀(p-value)" }, gridcolor: "#E6ECE8", rangemode: "tozero" },
    },
  };
}

type AtlasExplorerProps = { initialState: AtlasState };

export function AtlasExplorer({ initialState }: AtlasExplorerProps) {
  const [state, setState] = useState(() => compatibleState(initialState));
  const [rows, setRows] = useState<AssociationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [stableOnly, setStableOnly] = useState(true);

  /* eslint-disable react-hooks/set-state-in-effect -- These resets begin an external data-request lifecycle. */
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setRows([]);
    fetchPartition(state.analysis, state.model, state.contrast)
      .then((nextRows) => {
        if (!active) return;
        setRows(nextRows);
        const best = [...nextRows].sort((a, b) => (a.p ?? 1) - (b.p ?? 1))[0]?.feature_id;
        setState((current) => {
          const requested = current.feature && nextRows.some((row) => row.feature_id === current.feature);
          return requested || !best ? current : { ...current, feature: best };
        });
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Association data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [state.analysis, state.model, state.contrast]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    window.history.replaceState(null, "", `/explore?${atlasStateToSearch(state)}`);
  }, [state]);

  const categories = useMemo(() => [...new Set(rows.map((row) => row.category))].sort(), [rows]);
  const visibleRows = useMemo(() => rows.filter((row) => {
    if (stableOnly && row.unstable) return false;
    if (category !== "all" && row.category !== category) return false;
    if (state.significance === "fdr" && !row.sig_fdr) return false;
    if (state.significance === "bonferroni" && !row.sig_bon) return false;
    const needle = query.trim().toLowerCase();
    return !needle || row.feature_id.toLowerCase().includes(needle) || row.feature_name.toLowerCase().includes(needle);
  }), [rows, stableOnly, category, state.significance, query]);
  const rankedRows = useMemo(() => [...visibleRows].sort((a, b) => (a.p ?? 1) - (b.p ?? 1)), [visibleRows]);
  const selected = rows.find((row) => row.feature_id === state.feature) ?? rankedRows[0];
  const fdrCount = visibleRows.filter((row) => row.sig_fdr).length;
  const spec = useMemo(() => chartSpec(visibleRows, state.view, state.analysis, rows.length, selected?.feature_id), [visibleRows, state.view, state.analysis, rows.length, selected?.feature_id]);

  const updateState = <K extends keyof AtlasState>(key: K, value: AtlasState[K]) => setState((current) => ({ ...current, [key]: value }));
  const changeAnalysis = (analysis: Analysis) => setState((current) => compatibleState({ ...current, analysis }));
  const changeContrast = (contrast: string) => setState((current) => compatibleState({ ...current, contrast }));
  const selectPoint = useCallback((point: Record<string, unknown>) => {
    const customdata = Array.isArray(point.customdata) ? point.customdata : [];
    const featureId = String(customdata[0] ?? "");
    if (featureId) setState((current) => ({ ...current, feature: featureId }));
  }, []);

  return (
    <main className="explorer page-shell">
      <div className="breadcrumbs"><Link href="/">Atlas</Link><span>/</span><span>Explore</span></div>
      <header className="explorer__header">
        <div><div className="section-kicker">Disease-wide association scan</div><h1>{analysisName(state.analysis)}</h1></div>
        <p>{state.analysis === "prevalence" ? "Existing disease associations before the sleep-study index." : "New disease onset during post-index follow-up."}</p>
      </header>

      <section className="analysis-builder" aria-labelledby="analysis-builder-title">
        <h2 id="analysis-builder-title" className="sr-only">Analysis settings</h2>
        <div className="analysis-sentence">
          <span>Show</span>
          <label><span className="sr-only">Analysis family</span><select value={state.analysis} onChange={(event) => changeAnalysis(event.target.value as Analysis)}><option value="prevalence">Prevalence PheDAS</option><option value="incidence">Incidence PheDAS</option></select></label>
          <span>for</span>
          <label><span className="sr-only">OSA contrast</span><select value={state.contrast} onChange={(event) => changeContrast(event.target.value)}>{CONTRASTS[state.analysis].map((contrast) => <option key={contrast} value={contrast}>{CONTRAST_LABELS[contrast]}</option>)}</select></label>
          <span>adjusted with</span>
          <label><span className="sr-only">Adjustment model</span><select value={state.model} onChange={(event) => updateState("model", event.target.value as Model)}>{(["M1", "M2", "M3", "M4"] as Model[]).map((model) => <option key={model} value={model}>{MODEL_LABELS[model]}</option>)}</select></label>
          <span>across</span>
          <label><span className="sr-only">Disease category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">all disease categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        </div>
        <div className="secondary-controls">
          <label>Significance<select value={state.significance} onChange={(event) => updateState("significance", event.target.value as AtlasState["significance"])}><option value="all">All results</option><option value="fdr">FDR-significant</option><option value="bonferroni">Bonferroni-significant</option></select></label>
          <label>Find in scan<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or PheCode" /></label>
          <label className="check-control"><input type="checkbox" checked={stableOnly} onChange={(event) => setStableOnly(event.target.checked)} />Stable estimates only</label>
          <button className="text-button" type="button" onClick={() => { setCategory("all"); setQuery(""); setStableOnly(true); setState(compatibleState({ ...initialState })); }}>Reset</button>
        </div>
        <p className="cohort-note">Reference: AHI &lt;5 (“None”) within a sleep-clinic referral cohort. M4 is the primary presentation model and includes BMI.</p>
      </section>

      <section className="scan-summary" aria-label="Current scan summary">
        <div><strong>{visibleRows.length.toLocaleString()}</strong><span>endpoints displayed</span></div>
        <div><strong>{fdrCount.toLocaleString()}</strong><span>FDR-significant</span></div>
        <div><strong>{selected?.feature_name ?? "None"}</strong><span>selected feature</span></div>
      </section>

      <div className="view-tabs" role="group" aria-label="Result view">
        {(["manhattan", "volcano", "table"] as View[]).map((view) => {
          const disabled = view === "volcano" && state.contrast === "omnibus";
          return <button key={view} type="button" aria-pressed={state.view === view} disabled={disabled} title={disabled ? "Volcano view is unavailable for a non-directional omnibus test" : undefined} onClick={() => updateState("view", view)}>{view[0].toUpperCase() + view.slice(1)}</button>;
        })}
        <span className="marker-key"><i className="marker marker--higher" />Higher {effectShort(state.analysis)}<i className="marker marker--lower" />Lower {effectShort(state.analysis)}<i className="marker marker--open" />Not FDR-significant</span>
      </div>

      <div className="explorer-grid">
        <section className="plot-panel" aria-labelledby="plot-title">
          <div className="panel-heading"><div><span>{CONTRAST_LABELS[state.contrast]}</span><h2 id="plot-title">{state.view === "volcano" ? `${effectName(state.analysis)} and significance` : state.view === "table" ? "Ranked association results" : "Phenome-wide significance landscape"}</h2></div><button type="button" disabled title="Pending disclosure review">CSV pending review</button></div>
          {loading ? <div className="plot-loading" role="status">Loading approved aggregate results…</div> : error ? <div className="plot-error" role="alert">{error}</div> : state.view === "table" ? <ResultTable rows={rankedRows} analysis={state.analysis} selected={selected?.feature_id} onSelect={(feature) => updateState("feature", feature)} /> : <PlotlyChart data={spec.data} layout={spec.layout} ariaLabel={`${analysisName(state.analysis)} ${state.view} plot. Use the synchronized table for keyboard access.`} onPointClick={selectPoint} />}
        </section>

        <aside className="feature-inspector" aria-labelledby="selected-feature-title">
          {selected ? <>
            <span className="inspector-label">Selected feature</span><code>PheCode {selected.feature_id}</code><h2 id="selected-feature-title">{selected.feature_name}</h2><p className="inspector-category">{selected.category}</p>
            <div className="primary-estimate"><span>{effectShort(state.analysis)}</span><strong>{formatEffect(selected.effect)}</strong><small>{formatEffect(selected.ci_low)}–{formatEffect(selected.ci_high)} interval</small></div>
            <dl><div><dt>p-value</dt><dd>{formatP(selected.p)}</dd></div><div><dt>FDR</dt><dd>{selected.sig_fdr ? "Significant" : "Not significant"}</dd></div>{state.analysis === "incidence" ? <><div><dt>At risk</dt><dd>{selected.n_atrisk?.toLocaleString() ?? "—"}</dd></div><div><dt>Events</dt><dd>{selected.n_events?.toLocaleString() ?? "—"}</dd></div></> : null}</dl>
            {selected.unstable ? <p className="quality-warning">Estimate flagged as unstable{selected.unstable_reason ? `: ${selected.unstable_reason}` : "."}</p> : null}
            {state.analysis === "incidence" && selected.ph_p !== null && selected.ph_p !== undefined && selected.ph_p < 0.05 ? <p className="quality-warning">Proportional-hazards diagnostic flagged (p {formatP(selected.ph_p)}).</p> : null}
            <Link className="primary-link" href={`/feature?code=${encodeURIComponent(selected.feature_id)}&contrast=${state.contrast}`}>Open full feature page →</Link>
            {state.analysis === "incidence" && selected.sig_fdr ? <Link className="secondary-link" href={`/survival?code=${encodeURIComponent(selected.feature_id)}&view=severity`}>View cumulative-incidence curves →</Link> : null}
          </> : <p>Select a point or table row to inspect it.</p>}
        </aside>
      </div>

      {state.view !== "table" ? <section className="table-section"><div className="panel-heading"><div><span>Keyboard-accessible companion</span><h2>Association results</h2></div><p>Showing the 60 strongest displayed results</p></div><ResultTable rows={rankedRows} analysis={state.analysis} selected={selected?.feature_id} onSelect={(feature) => updateState("feature", feature)} limit={60} /></section> : null}
      <p className="research-preview-note">Research preview. Aggregate associations describe relationships within a sleep-clinic referral cohort; they do not estimate population OSA prevalence or establish causality. Prevalence downloads remain unavailable pending per-feature disclosure review.</p>
      <div className="sr-only" aria-live="polite">{selected ? `Selected ${selected.feature_name}, PheCode ${selected.feature_id}` : `${visibleRows.length} results`}</div>
    </main>
  );
}

function ResultTable({ rows, analysis, selected, onSelect, limit = 100 }: { rows: AssociationRow[]; analysis: Analysis; selected?: string; onSelect: (feature: string) => void; limit?: number }) {
  return <div className="result-table-wrap"><table className="result-table"><caption className="sr-only">Ranked {analysisName(analysis)} association results</caption><thead><tr><th>Feature</th><th>Category</th><th>{effectShort(analysis)} (interval)</th><th>p-value</th><th>Significance</th><th>Quality</th></tr></thead><tbody>{rows.slice(0, limit).map((row) => <tr key={row.feature_id} className={row.feature_id === selected ? "is-selected" : ""}><th scope="row"><button type="button" onClick={() => onSelect(row.feature_id)}><strong>{row.feature_name}</strong><code>{row.feature_id}</code></button></th><td>{row.category}</td><td className="numeric">{formatEffect(row.effect)} <small>({formatEffect(row.ci_low)}–{formatEffect(row.ci_high)})</small></td><td className="numeric">{formatP(row.p)}</td><td>{row.sig_bon ? <span className="sig-badge sig-badge--bon">Bonf.</span> : row.sig_fdr ? <span className="sig-badge">FDR</span> : <span className="muted">—</span>}</td><td>{row.unstable ? <span className="warning-badge">Flagged</span> : <span className="quality-ok">Stable</span>}</td></tr>)}</tbody></table></div>;
}
