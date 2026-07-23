"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  commonReferenceLabel,
  fetchSurvivalFeature,
  type SurvivalFeaturePayload,
  type SurvivalManifest,
  type SurvivalManifestFeature,
} from "../survival-data";
import {
  survivalStateToSearch,
  type SurvivalState,
  type SurvivalView,
} from "../survival-state";
import { PlotlyChart } from "./PlotlyChart";

type CurveSeries = {
  group: string;
  panel?: string;
  time: number[];
  cif: number[];
};

const severityStyle: Record<string, { color: string; dash: string }> = {
  "No OSA": { color: "#68716e", dash: "dash" },
  Mild: { color: "#a66f00", dash: "dot" },
  Moderate: { color: "#cb5d12", dash: "dashdot" },
  Severe: { color: "#84364f", dash: "solid" },
};

function cpapStyle(group: string) {
  if (group === "No OSA") return { color: "#68716e", dash: "dash" };
  if (group.includes("<2")) return { color: "#84364f", dash: "solid" };
  if (group.includes("2-4") || group.includes("2–4")) return { color: "#cf6b13", dash: "dash" };
  return { color: "#08766f", dash: "dot" };
}

function ordered<T extends { group: string }>(rows: T[], order: string[]) {
  return [...rows].sort((a, b) => {
    const left = order.indexOf(a.group);
    const right = order.indexOf(b.group);
    return (left < 0 ? 999 : left) - (right < 0 ? 999 : right);
  });
}

function severitySeries(payload: SurvivalFeaturePayload): CurveSeries[] {
  const { columns } = payload.severity;
  const grouped = new Map<string, CurveSeries>();
  for (let index = 0; index < payload.severity.row_count; index += 1) {
    const group = columns.group[index];
    const series = grouped.get(group) ?? { group, time: [], cif: [] };
    series.time.push(Number(columns.time_years[index]));
    series.cif.push(Number(columns.cif_pct[index]));
    grouped.set(group, series);
  }
  for (const series of grouped.values()) {
    const zipped = series.time.map((time, index) => ({ time, cif: series.cif[index] }))
      .sort((a, b) => a.time - b.time);
    series.time = zipped.map((point) => point.time);
    series.cif = zipped.map((point) => point.cif);
  }
  return ordered([...grouped.values()], payload.strata.severity_group_order);
}

function cpapSeries(
  payload: SurvivalFeaturePayload,
  severity: CurveSeries[],
  commonReference: string,
) {
  const byPanel = new Map<string, Map<string, CurveSeries>>();
  const { columns } = payload.cpap;
  for (let index = 0; index < payload.cpap.row_count; index += 1) {
    const panel = columns.panel[index];
    const group = columns.group[index];
    const panelSeries = byPanel.get(panel) ?? new Map<string, CurveSeries>();
    const series = panelSeries.get(group) ?? { panel, group, time: [], cif: [] };
    series.time.push(Number(columns.time_years[index]));
    series.cif.push(Number(columns.cif_pct[index]));
    panelSeries.set(group, series);
    byPanel.set(panel, panelSeries);
  }
  const reference = severity.find((series) => series.group === commonReference);
  return payload.strata.cpap_panel_order.map((panel) => {
    const observed = [...(byPanel.get(panel)?.values() ?? [])];
    for (const series of observed) {
      const zipped = series.time.map((time, index) => ({ time, cif: series.cif[index] }))
        .sort((a, b) => a.time - b.time);
      series.time = zipped.map((point) => point.time);
      series.cif = zipped.map((point) => point.cif);
    }
    const withReference = reference
      ? [{ ...reference, panel }, ...observed.filter((series) => series.group !== commonReference)]
      : observed;
    return {
      panel,
      series: ordered(withReference, payload.strata.cpap_group_order),
    };
  });
}

function yMaximum(series: CurveSeries[]) {
  const observed = Math.max(0, ...series.flatMap((item) => item.cif));
  if (observed === 0) return 1;
  return Math.min(100, Math.max(1, Math.ceil(observed * 1.08)));
}

function chartSpec(
  series: CurveSeries[],
  yMax: number,
  kind: SurvivalView,
  height: number,
  showLegend = true,
) {
  return {
    data: series.map((item) => {
      const style = kind === "severity"
        ? severityStyle[item.group] ?? { color: "#145c8a", dash: "solid" }
        : cpapStyle(item.group);
      return {
        type: "scatter",
        mode: "lines",
        name: item.group,
        x: item.time,
        y: item.cif,
        line: { color: style.color, dash: style.dash, width: item.group === "No OSA" ? 2.2 : 2.8, shape: "hv" },
        hovertemplate: `<b>${item.group}</b><br>Year %{x:.2f}<br>Cumulative incidence %{y:.2f}%<extra></extra>`,
      };
    }),
    layout: {
      autosize: true,
      height,
      margin: { l: 68, r: 22, t: 26, b: showLegend ? 92 : 64 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      hovermode: "x unified",
      showlegend: showLegend,
      legend: { orientation: "h", x: 0, y: -0.2, font: { size: 11 } },
      font: { family: "Inter, Arial, sans-serif", color: "#172422", size: 12 },
      xaxis: {
        title: { text: "Years since index" },
        range: [0, 6],
        tickmode: "linear",
        dtick: 1,
        gridcolor: "#e6ece8",
        zeroline: false,
      },
      yaxis: {
        title: { text: "Cumulative incidence (%)" },
        range: [0, yMax],
        rangemode: "tozero",
        gridcolor: "#e6ece8",
        zeroline: false,
      },
      uirevision: `${kind}-${series.map((item) => item.group).join("|")}`,
    } as Record<string, unknown>,
  };
}

function valueAtYear(series: CurveSeries, year: number) {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  series.time.forEach((time, index) => {
    const distance = Math.abs(time - year);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex >= 0 && bestDistance < 0.05 ? series.cif[bestIndex] : null;
}

function formatPct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function AnnualCurveTable({
  series,
  years,
  caption,
}: {
  series: CurveSeries[];
  years: number[];
  caption: string;
}) {
  return (
    <div className="curve-table-wrap">
      <table className="curve-table">
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Group</th>{years.map((year) => <th scope="col" key={year}>Year {year}</th>)}</tr></thead>
        <tbody>{series.map((item) => <tr key={`${item.panel ?? "severity"}-${item.group}`}><th scope="row">{item.group}</th>{years.map((year) => <td key={year}>{formatPct(valueAtYear(item, year))}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function contrastLabel(contrast: string) {
  const labels: Record<string, string> = {
    severe_vs_none: "Severe vs None",
    moderate_vs_none: "Moderate vs None",
    mild_vs_none: "Mild vs None",
    ahi_ge5: "AHI ≥5",
    ahi_ge15: "AHI ≥15",
    trend: "Severity trend",
    omnibus: "Severity omnibus",
  };
  return labels[contrast] ?? contrast.replaceAll("_", " ");
}

function FeatureControls({
  manifest,
  selected,
  query,
  onQuery,
  onSelect,
}: {
  manifest: SurvivalManifest | null;
  selected?: SurvivalManifestFeature;
  query: string;
  onQuery: (value: string) => void;
  onSelect: (featureId: string) => void;
}) {
  const features = manifest?.features ?? [];
  const needle = query.trim().toLowerCase();
  const visible = features.filter((feature) =>
    feature.feature_id === selected?.feature_id ||
    !needle ||
    `${feature.feature_name} ${feature.feature_id} ${feature.category}`.toLowerCase().includes(needle)
  );
  return (
    <div className="survival-controls">
      <label>
        Filter the selected outcomes
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Try hypertension or 401.1" />
      </label>
      <label>
        Outcome
        <select disabled={!manifest} value={selected?.feature_id ?? ""} onChange={(event) => onSelect(event.target.value)}>
          {!manifest ? <option value="">Loading curve index…</option> : null}
          {visible.map((feature) => <option value={feature.feature_id} key={feature.feature_id}>{feature.feature_name} · {feature.feature_id}{feature.osa_control ? " · methodological control" : ""}</option>)}
        </select>
      </label>
      <span>{manifest ? `${features.filter((feature) => !feature.osa_control).length} findings + 1 control` : "FDR-selected Incidence PheDAS outcomes"}</span>
    </div>
  );
}

export function SurvivalExplorer({
  initialState,
  initialManifest,
}: {
  initialState: SurvivalState;
  initialManifest: SurvivalManifest;
}) {
  const manifest = initialManifest;
  const [state, setState] = useState(() => ({
    ...initialState,
    code: manifest.features.some((feature) => feature.feature_id === initialState.code)
      ? initialState.code
      : manifest.defaults.feature_id,
  }));
  const [payload, setPayload] = useState<SurvivalFeaturePayload | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => manifest.features.find((feature) => feature.feature_id === state.code),
    [manifest, state.code],
  );

  /* eslint-disable react-hooks/set-state-in-effect -- These resets begin an external curve-data request. */
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setLoading(true);
    setError("");
    setPayload(null);
    fetchSurvivalFeature(selected).then((nextPayload) => {
      if (active) setPayload(nextPayload);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Curve data could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [selected]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    window.history.replaceState(null, "", `/survival?${survivalStateToSearch(state)}`);
  }, [state]);

  const severity = useMemo(() => payload ? severitySeries(payload) : [], [payload]);
  const commonReference = commonReferenceLabel(
    payload?.strata.common_reference ??
    payload?.strata.cpap_common_reference ??
    manifest.strata.cpap_common_reference,
  );
  const panels = useMemo(
    () => payload ? cpapSeries(payload, severity, commonReference) : [],
    [payload, severity, commonReference],
  );
  const allSeries = [...severity, ...panels.flatMap((panel) => panel.series)];
  const yMax = yMaximum(allSeries);
  const years = payload?.metadata.table_time_years?.length
    ? payload.metadata.table_time_years
    : [0, 1, 2, 3, 4, 5, 6];

  const setView = (view: SurvivalView) => setState((current) => ({ ...current, view }));

  return (
    <main className="survival-page page-shell">
      <div className="breadcrumbs"><Link href="/">Atlas</Link><span>/</span><Link href="/explore?analysis=incidence">Incidence PheDAS</Link><span>/</span><span>Cumulative incidence</span></div>

      <header className="survival-hero">
        <div>
          <div className="section-kicker">Incidence PheDAS · survival analysis</div>
          <h1>Cumulative incidence after index</h1>
          <p>Follow FDR-selected incident disease outcomes through six years, stratified by OSA severity or recorded CPAP usage.</p>
        </div>
        <aside className="hero__note">
          <span>Observed absolute incidence</span>
          <strong>Aalen–Johansen · death competing</strong>
          <p>These curves are descriptive and unadjusted. They answer a different question from the adjacent M4 cause-specific Cox hazard ratios.</p>
        </aside>
      </header>

      <FeatureControls manifest={manifest} selected={selected} query={query} onQuery={setQuery} onSelect={(code) => setState((current) => ({ ...current, code }))} />

      {selected?.osa_control && !payload ? <p className="control-warning survival-control-warning"><strong>Methodological control.</strong> PheCode 327.3 is the circular OSA-recoding phenotype and should not be interpreted as an incident disease finding.</p> : null}

      <div className="view-tabs survival-tabs" role="group" aria-label="Curve stratification">
        <button type="button" aria-pressed={state.view === "severity"} onClick={() => setView("severity")}>OSA severity</button>
        <button type="button" aria-pressed={state.view === "cpap"} onClick={() => setView("cpap")}>Recorded CPAP usage</button>
        <span className="curve-key">Stepped curves · cumulative incidence (%)</span>
      </div>

      {state.view === "cpap" ? <div className="cpap-warning"><strong>Descriptive CPAP strata—not treatment effects.</strong><span>Usage is observational and available only where CPAP records exist; missing usage is not a “no CPAP” group. The same No OSA reference curve is repeated in each panel.</span></div> : null}

      {payload ? <section className="survival-feature-summary" aria-labelledby="curve-feature-title">
        <div><span className="inspector-label">Selected outcome</span><code>PheCode {payload.metadata.feature_id}</code><h2 id="curve-feature-title">{payload.metadata.feature_name}</h2><p>{payload.metadata.category}</p></div>
        <dl>
          <div><dt>M4 Severe-vs-None HR</dt><dd>{payload.metadata.severe_hr === null ? "—" : payload.metadata.severe_hr.toFixed(2)}</dd></div>
          <div><dt>FDR-significant contrasts</dt><dd>{payload.metadata.sig_contrasts.map(contrastLabel).join(", ")}</dd></div>
          <div><dt>Follow-up displayed</dt><dd>0–6 years</dd></div>
        </dl>
        {payload.metadata.osa_control ? <p className="control-warning"><strong>Methodological control.</strong> This is the circular OSA-recoding phenotype and should not be interpreted as an incident disease finding.</p> : null}
      </section> : null}

      {loading ? <div className="plot-loading" role="status">Loading aggregate cumulative-incidence curves…</div> : null}
      {error ? <div className="plot-error" role="alert">{error}</div> : null}

      {!loading && payload && state.view === "severity" ? <section className="survival-curve-panel" aria-labelledby="severity-curves-title">
        <div className="panel-heading"><div><span>OSA severity</span><h2 id="severity-curves-title">Cumulative incidence by sleep-study severity</h2></div><p>Reference: AHI &lt;5 (“No OSA”) within the referred cohort.</p></div>
        <PlotlyChart data={chartSpec(severity, yMax, "severity", 520).data} layout={chartSpec(severity, yMax, "severity", 520).layout} ariaLabel={`${payload.metadata.feature_name} cumulative incidence by OSA severity`} allowImageExport={false} />
        <details className="curve-table-details" open><summary>Annual cumulative-incidence values</summary><AnnualCurveTable series={severity} years={years} caption={`${payload.metadata.feature_name}: cumulative incidence percent by OSA severity`} /></details>
      </section> : null}

      {!loading && payload && state.view === "cpap" ? <>
        <section className="cpap-grid" aria-label="Cumulative incidence by recorded CPAP usage and OSA severity">
          {panels.map(({ panel, series: panelSeries }, panelIndex) => {
            const omitted = payload.cpap.omitted_strata.filter((item) => item.panel === panel);
            const spec = chartSpec(panelSeries, yMax, "cpap", 380, panelIndex === 0);
            return <article className="cpap-panel" key={panel}><div className="cpap-panel__heading"><span>{panel} OSA</span><h2>Recorded nightly CPAP use</h2></div><PlotlyChart data={spec.data} layout={spec.layout} ariaLabel={`${payload.metadata.feature_name} cumulative incidence in the ${panel} OSA panel by recorded CPAP usage`} allowImageExport={false} />{omitted.length ? <p className="omitted-note">Unavailable source stratum: {omitted.map((item) => item.group).join(", ")}. It did not meet the prespecified curve-emission criteria.</p> : null}<details className="curve-table-details"><summary>Annual values for {panel} OSA</summary><AnnualCurveTable series={panelSeries} years={years} caption={`${payload.metadata.feature_name}: ${panel} OSA panel cumulative incidence percent`} /></details></article>;
          })}
        </section>
      </> : null}

      <section className="curve-notes" aria-labelledby="curve-notes-title">
        <div><span className="section-kicker">How to read this view</span><h2 id="curve-notes-title">Curve context stays attached</h2></div>
        <div className="curve-note-grid">
          <article><strong>Selected outcomes</strong><p>Only PheCodes FDR-significant in at least one M4 OSA-severity contrast are shown. The curves are post-selection descriptions, not independent validation.</p></article>
          <article><strong>Source threshold</strong><p>Curves were emitted only for strata with at least 20 participants at baseline and at least 5 incident events. A missing stratum is unavailable, not zero incidence.</p></article>
          <article><strong>Disclosure status</strong><p>Exact monthly at-risk and cumulative-event cells, uncertainty bands, and downloads are unavailable. Count arrays remain outside the browser bundle pending disclosure review.</p></article>
          <article><strong>Follow-up horizon</strong><p>Follow-up ends May 31, 2023. Curves are displayed to six years; later tails may be supported by thinner risk sets.</p></article>
        </div>
      </section>

      <p className="research-preview-note">Private research preview. Cumulative incidence is an observed absolute-risk summary within a sleep-clinic referral cohort and should not be interpreted as an adjusted effect, a causal contrast, or population OSA prevalence.</p>
    </main>
  );
}
