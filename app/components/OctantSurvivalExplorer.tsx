"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchPhenotypeSurvivalOutcome,
  type OctantSurvivalLevel,
  type OctantSurvivalOutcome,
  type OctantSurvivalPanel,
  type PhenotypeCurvePanel,
  type PhenotypeDataset,
  type PhenotypeSurvivalOutcomePayload,
} from "../phenotype-data";
import { PlotlyChart } from "./PlotlyChart";

type SignificanceScope = "all" | "fdr" | "bonferroni";

type ResultRow = {
  outcome: OctantSurvivalOutcome;
  panel: OctantSurvivalPanel;
};

function octantLabel(id: string) {
  return id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resultKey(row: ResultRow) {
  return `${row.outcome.outcome_id}|${row.panel.octant}`;
}

function formatP(value: number) {
  if (value < 0.001) return value.toExponential(1);
  return value.toFixed(3);
}

function formatCount(value: number | null) {
  return value === null ? "Suppressed (<11)" : value.toLocaleString();
}

function significanceLabel(panel: OctantSurvivalPanel) {
  if (panel.sig_bon) return "Bonferroni";
  if (panel.sig_fdr) return "FDR";
  return "Gated";
}

function panelMatchesScope(panel: OctantSurvivalPanel, scope: SignificanceScope) {
  if (scope === "bonferroni") return panel.sig_bon;
  if (scope === "fdr") return panel.sig_fdr;
  return true;
}

function flattenLevel(level: OctantSurvivalLevel) {
  return level.outcomes.flatMap((outcome) => outcome.panels.map((panel) => ({ outcome, panel })));
}

function chartSpec(panel: PhenotypeCurvePanel, focalLabel: string) {
  if (panel.curve_status !== "available") return null;
  const entries = [
    { key: "focal" as const, name: focalLabel, color: "#df5d2f", width: 3 },
    { key: "other_seven" as const, name: "Other seven (pooled)", color: "#727b78", width: 2.4 },
  ];
  const maximum = Math.max(
    1,
    ...entries.flatMap(({ key }) => panel.curves[key].cif_pct),
  );
  return {
    data: entries.map(({ key, name, color, width }) => ({
      type: "scatter",
      mode: "lines",
      name,
      x: panel.curves[key].time_years,
      y: panel.curves[key].cif_pct,
      line: { color, width, shape: "hv", dash: key === "focal" ? "solid" : "dash" },
      hovertemplate: `<b>${name}</b><br>Year %{x:.2f}<br>Cumulative incidence %{y:.2f}%<extra></extra>`,
    })),
    layout: {
      autosize: true,
      height: 440,
      margin: { l: 68, r: 22, t: 24, b: 92 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      hovermode: "x unified",
      showlegend: true,
      legend: { orientation: "h", x: 0, y: -0.2, font: { size: 11 } },
      font: { family: "Inter, Arial, sans-serif", color: "#172422", size: 12 },
      xaxis: {
        title: { text: "Years since index" },
        range: [0, 3],
        tickmode: "linear",
        dtick: 0.5,
        gridcolor: "#e6ece8",
        zeroline: false,
      },
      yaxis: {
        title: { text: "Cumulative incidence (%)" },
        range: [0, Math.min(100, Math.max(1, Math.ceil(maximum * 1.1)))],
        rangemode: "tozero",
        gridcolor: "#e6ece8",
        zeroline: false,
      },
      uirevision: `${panel.octant}-octant-cif`,
    } as Record<string, unknown>,
  };
}

function ResultsTable({
  level,
  rows,
  selected,
  onSelect,
}: {
  level: OctantSurvivalLevel;
  rows: ResultRow[];
  selected: ResultRow | null;
  onSelect: (row: ResultRow) => void;
}) {
  return (
    <div className="octant-results-scroll">
      <table className="octant-results-table octant-results-table--expanded">
        <caption>{level.label}: one-vs-rest M4 models for nominally omnibus-gated outcomes.</caption>
        <thead>
          <tr>
            <th scope="col">Outcome</th>
            <th scope="col">Focal phenotype</th>
            <th scope="col">Adjusted M4 HR (95% CI)</th>
            <th scope="col">q / status</th>
            <th scope="col">3-year CIF</th>
            <th scope="col">Quality</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => {
            const difference = row.panel.cif3_focal_pct - row.panel.cif3_rest_pct;
            const selectedRow = selected ? resultKey(selected) === resultKey(row) : false;
            return (
              <tr key={resultKey(row)} data-selected={selectedRow}>
                <td>
                  <button type="button" onClick={() => onSelect(row)} aria-pressed={selectedRow}>
                    <strong>{row.outcome.outcome_name}</strong>
                    <small>{level.id === "phecode" ? `PheCode ${row.outcome.outcome_id}` : row.outcome.category}</small>
                  </button>
                </td>
                <td>{octantLabel(row.panel.octant)}</td>
                <td data-direction={row.panel.hr_m4 >= 1 ? "higher" : "lower"}>
                  <strong>{row.panel.hr_m4.toFixed(2)}</strong>
                  <small>({row.panel.ci_low.toFixed(2)}–{row.panel.ci_high.toFixed(2)})</small>
                </td>
                <td><strong>{formatP(row.panel.q_fdr)}</strong><small>{significanceLabel(row.panel)}</small></td>
                <td>{row.panel.cif3_focal_pct.toFixed(2)}%<small>{difference >= 0 ? "+" : ""}{difference.toFixed(2)} pp vs pooled</small></td>
                <td>
                  {row.panel.unstable ? <span className="quality-badge quality-badge--warning">EPV &lt;10</span> : <span className="quality-badge">No EPV &lt;10 flag</span>}
                  {!row.panel.curve_available ? <small>Curve withheld</small> : null}
                </td>
              </tr>
            );
          }) : (
            <tr><td colSpan={6} className="octant-results-empty">No panel matches the current filters.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AnnualRiskTable({ panel, focalLabel }: { panel: PhenotypeCurvePanel; focalLabel: string }) {
  const groups = [
    { id: "focal" as const, label: focalLabel },
    { id: "other_seven" as const, label: "Other seven (pooled)" },
  ];
  return (
    <div className="phenotype-risk-scroll">
      <table className="phenotype-risk-table">
        <caption>Annual at-risk and cumulative-event counts. Suppressed values are null, never zero.</caption>
        <thead><tr><th scope="col">Group</th>{panel.risk_table.focal.map((row) => <th scope="col" key={row.time_years}>Year {row.time_years}</th>)}</tr></thead>
        <tbody>{groups.map((group) => (
          <tr key={group.id}>
            <th scope="row">{group.label}</th>
            {panel.risk_table[group.id].map((row) => (
              <td key={row.time_years}>
                <strong>{row.n_at_risk.toLocaleString()} at risk</strong>
                <small>{formatCount(row.n_events_cum)} {row.n_events_cum === null ? "events" : "cumulative events"}</small>
              </td>
            ))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function PanelDetail({
  data,
  level,
  row,
  payload,
  loading,
  error,
}: {
  data: PhenotypeDataset;
  level: OctantSurvivalLevel;
  row: ResultRow;
  payload: PhenotypeSurvivalOutcomePayload | null;
  loading: boolean;
  error: string;
}) {
  const curvePanel = payload?.panels.find((panel) => panel.octant === row.panel.octant) ?? null;
  const focalLabel = octantLabel(row.panel.octant);
  const spec = useMemo(() => curvePanel ? chartSpec(curvePanel, focalLabel) : null, [curvePanel, focalLabel]);
  const raised = row.panel.hr_m4 >= 1;
  return (
    <article className="octant-survival-detail" aria-live="polite">
      <div className="octant-survival-summary__heading">
        <div>
          <span>{level.id === "phecode" ? `PheCode ${row.outcome.outcome_id}` : `${row.outcome.category} system`}</span>
          <h3>{row.outcome.outcome_name}</h3>
          <p><strong>{focalLabel}</strong> versus the pooled other seven octants.</p>
          <div className="result-badges">
            <span data-kind={row.panel.sig_bon ? "bonferroni" : row.panel.sig_fdr ? "fdr" : "gated"}>{significanceLabel(row.panel)}</span>
            {row.panel.unstable ? <span data-kind="warning">Sparse data · EPV &lt;10</span> : <span>No EPV &lt;10 warning</span>}
            <span>PH diagnostic · not evaluated</span>
          </div>
        </div>
        <div className={raised ? "effect-badge effect-badge--raised" : "effect-badge effect-badge--lower"}>
          <span>Adjusted M4 HR</span>
          <strong>{row.panel.hr_m4.toFixed(2)}</strong>
          <small>{row.panel.ci_low.toFixed(2)}–{row.panel.ci_high.toFixed(2)} · p {formatP(row.panel.p)} · q {formatP(row.panel.q_fdr)}</small>
        </div>
      </div>

      <div className="phenotype-estimand-note">
        <strong>Curve: unadjusted Aalen–Johansen cumulative incidence (death competing).</strong>
        <span>Association: adjusted M4 hazard ratio from a separate ridge-penalized Cox model. Curve separation is descriptive—not an adjusted or causal contrast.</span>
      </div>

      {loading ? <div className="phenotype-curve-state"><strong>Loading interactive curve…</strong><p>Retrieving the aggregate outcome asset.</p></div> : null}
      {error ? <div className="phenotype-curve-state phenotype-curve-state--error"><strong>Curve unavailable</strong><p>{error}</p></div> : null}
      {!loading && !error && curvePanel?.curve_status === "available" && spec ? (
        <PlotlyChart
          data={spec.data}
          layout={spec.layout}
          ariaLabel={`${row.outcome.outcome_name} cumulative incidence for ${focalLabel} versus the pooled other seven octants`}
          className="phenotype-survival-plot"
          allowImageExport={false}
        />
      ) : null}
      {!loading && !error && curvePanel?.curve_status === "withheld_event_count_suppression" ? (
        <div className="phenotype-curve-state phenotype-curve-state--withheld">
          <strong>Curve coordinates withheld</strong>
          <p>The focal event count is below 11. The model estimate remains searchable, but the high-precision trajectory is not published because it could reveal a rare-event pattern.</p>
        </div>
      ) : null}

      <div className="phenotype-tail-warning">
        <strong>Thin 3-year tail</strong>
        <p>{data.survival.tail_warning}</p>
      </div>

      <dl className="phenotype-panel-stats">
        <div><dt>Focal 3-year CIF</dt><dd>{row.panel.cif3_focal_pct.toFixed(2)}%</dd><small>{formatCount(row.panel.events_focal)} events / {row.panel.n_focal.toLocaleString()} baseline</small></div>
        <div><dt>Pooled 3-year CIF</dt><dd>{row.panel.cif3_rest_pct.toFixed(2)}%</dd><small>{formatCount(row.panel.events_rest)} events / {row.panel.n_rest.toLocaleString()} baseline</small></div>
        <div><dt>Penalizer</dt><dd>{row.panel.penalizer.toFixed(2)}</dd><small>M4 ridge Cox</small></div>
        <div><dt>Omnibus gate</dt><dd>p {formatP(row.panel.omnibus_p_m4)}</dd><small>7-df joint Wald</small></div>
      </dl>

      {curvePanel ? <AnnualRiskTable panel={curvePanel} focalLabel={focalLabel} /> : null}
      <p className="octant-survival-summary__note">{level.description}</p>
    </article>
  );
}

export function OctantSurvivalExplorer({ data }: { data: PhenotypeDataset }) {
  const [levelId, setLevelId] = useState<OctantSurvivalLevel["id"]>("phecode");
  const [scope, setScope] = useState<SignificanceScope>("all");
  const [query, setQuery] = useState("");
  const [octant, setOctant] = useState("all");
  const [selectionByLevel, setSelectionByLevel] = useState<Record<OctantSurvivalLevel["id"], string>>(() => {
    const entries = data.survival.levels.map((level) => {
      const rows = flattenLevel(level);
      const preferred = rows.find((row) => row.panel.sig_bon) ?? rows[0];
      return [level.id, preferred ? resultKey(preferred) : ""];
    });
    return Object.fromEntries(entries) as Record<OctantSurvivalLevel["id"], string>;
  });
  const [curveRequest, setCurveRequest] = useState<{
    path: string;
    payload: PhenotypeSurvivalOutcomePayload | null;
    error: string;
  }>({ path: "", payload: null, error: "" });

  const level = data.survival.levels.find((item) => item.id === levelId) ?? data.survival.levels[0]!;
  const allRows = useMemo(() => flattenLevel(level), [level]);
  const scopeCounts = useMemo(() => ({
    all: allRows.length,
    fdr: allRows.filter((row) => row.panel.sig_fdr).length,
    bonferroni: allRows.filter((row) => row.panel.sig_bon).length,
  }), [allRows]);
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allRows
      .filter((row) => panelMatchesScope(row.panel, scope))
      .filter((row) => octant === "all" || row.panel.octant === octant)
      .filter((row) => !needle || `${row.outcome.outcome_id} ${row.outcome.outcome_name} ${row.outcome.category} ${row.panel.octant}`.toLowerCase().includes(needle))
      .sort((left, right) => {
        const leftRank = left.panel.sig_bon ? 0 : left.panel.sig_fdr ? 1 : 2;
        const rightRank = right.panel.sig_bon ? 0 : right.panel.sig_fdr ? 1 : 2;
        return leftRank - rightRank || left.panel.p - right.panel.p || left.outcome.outcome_name.localeCompare(right.outcome.outcome_name);
      });
  }, [allRows, octant, query, scope]);
  const selected = useMemo(
    () => filteredRows.find((row) => resultKey(row) === selectionByLevel[levelId]) ?? filteredRows[0] ?? null,
    [filteredRows, levelId, selectionByLevel],
  );
  const selectedOutcome = selected?.outcome ?? null;
  const selectedPath = selectedOutcome?.asset_path ?? "";
  const curvePayload = curveRequest.path === selectedPath ? curveRequest.payload : null;
  const error = curveRequest.path === selectedPath ? curveRequest.error : "";
  const loading = Boolean(selectedOutcome && curveRequest.path !== selectedPath);

  useEffect(() => {
    if (!selectedOutcome) return;
    const path = selectedOutcome.asset_path;
    const controller = new AbortController();
    fetchPhenotypeSurvivalOutcome(level.id, selectedOutcome, controller.signal)
      .then((payload) => {
        setCurveRequest({ path, payload, error: "" });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setCurveRequest({
          path,
          payload: null,
          error: caught instanceof Error ? caught.message : "The aggregate curve asset could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [level.id, selectedOutcome]);

  function choose(row: ResultRow) {
    setSelectionByLevel((current) => ({ ...current, [levelId]: resultKey(row) }));
  }

  return (
    <section className="octant-survival" aria-labelledby="octant-survival-title">
      <div className="section-heading">
        <div><span>Octant-exposure Incidence PheDAS</span><h2 id="octant-survival-title">Look up any gated phenotype–outcome panel</h2></div>
        <p>Search 168 one-vs-rest M4 panels across 21 nominally omnibus-gated outcomes, then inspect the interactive cumulative-incidence trajectory.</p>
      </div>

      <div className="view-tabs octant-survival-tabs" role="group" aria-label="Octant survival outcome level">
        {data.survival.levels.map((item) => (
          <button type="button" key={item.id} aria-pressed={levelId === item.id} onClick={() => { setLevelId(item.id); setQuery(""); setOctant("all"); }}>
            {item.label} · {item.panel_count}
          </button>
        ))}
      </div>

      <div className="octant-significance-switch" role="group" aria-label="Significance scope">
        {([
          ["all", "All gated"],
          ["fdr", "FDR"],
          ["bonferroni", "Bonferroni"],
        ] as const).map(([id, label]) => (
          <button type="button" key={id} aria-pressed={scope === id} onClick={() => setScope(id)}>{label}<span>{scopeCounts[id]}</span></button>
        ))}
      </div>

      <div className="octant-survival-controls">
        <label><span>Search outcomes</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={levelId === "phecode" ? "Try hypertension or a PheCode" : "Try cardiovascular"} /></label>
        <label><span>Focal phenotype</span><select value={octant} onChange={(event) => setOctant(event.target.value)}><option value="all">All eight phenotypes</option>{data.octants.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <div><strong>{filteredRows.length} of {allRows.length} panels</strong><p>{level.description}</p></div>
      </div>

      <div className="multiplicity-callout">
        <strong>How correction works</strong>
        <p>{data.survival.testing.bonferroni}</p>
      </div>

      <ResultsTable level={level} rows={filteredRows} selected={selected} onSelect={choose} />
      {selected ? <PanelDetail data={data} level={level} row={selected} payload={curvePayload} loading={loading} error={error} /> : <p className="octant-detail-empty">No panel matches the current filters.</p>}

      <details className="phenotype-analysis-notes">
        <summary>Analysis and disclosure details</summary>
        <div>
          <p>{data.survival.testing.gate}</p>
          <p>{data.survival.testing.fdr}</p>
          <p>{data.survival.model.ph_note}</p>
          <p>{data.survival.disclosure.rule} {data.survival.disclosure.curve_rule}</p>
        </div>
      </details>
    </section>
  );
}
