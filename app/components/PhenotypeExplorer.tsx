"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import {
  publicAssetPath,
  type OctantPhenotype,
  type OctantSurvivalLevel,
  type OctantSurvivalRow,
  type PhenotypeDataset,
  type PhenotypeMetric,
} from "../phenotype-data";

const metricOrder = [
  "odi4",
  "minimum_spo2",
  "mean_spo2",
  "t90",
  "epworth",
  "isi",
  "fosq_impairment",
  "phq2",
  "stop",
  "distinct_phecodes",
  "obesity",
  "hyperlipidemia",
  "hypertension",
  "impaired_fasting_glucose",
  "anxiety_disorders",
  "gerd",
  "index_ahi",
];

type MetricDomain = PhenotypeMetric["domain"];
type MetricDomainFilter = "all" | MetricDomain;

const metricDomainOptions: Array<{ id: MetricDomainFilter; label: string }> = [
  { id: "all", label: "All 17 measures" },
  { id: "physiologic", label: "Physiology" },
  { id: "symptom", label: "Symptoms" },
  { id: "comorbidity", label: "Comorbidity" },
  { id: "external", label: "Index AHI" },
];

function formatMetric(metric: PhenotypeMetric) {
  if (metric.unit === "proportion" || metric.unit === "fraction") return (metric.value * 100).toFixed(1);
  if (metric.unit === "count") return metric.value.toFixed(0);
  return metric.value.toFixed(metric.value >= 10 ? 1 : 2);
}

function metricUnit(metric: PhenotypeMetric) {
  if (metric.unit === "proportion" || metric.unit === "fraction") return "%";
  return metric.unit;
}

function octantLabel(id: string) {
  return id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatP(value: number) {
  if (value < 0.001) return value.toExponential(1);
  return value.toFixed(3);
}

function rowKey(row: OctantSurvivalRow) {
  return `${row.outcome_id}|${row.octant}`;
}

function OctantCard({
  octant,
  selected,
  onSelect,
}: {
  octant: OctantPhenotype;
  selected: boolean;
  onSelect: () => void;
}) {
  const highCount = octant.bits.reduce((total, bit) => total + bit, 0);
  return (
    <button
      type="button"
      className="octant-card"
      data-high-count={highCount}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="octant-glyph" aria-label={`${highCount} axes above their medians`}>{octant.glyph}</span>
      <strong>{octant.label}</strong>
      <small>{octant.n.toLocaleString()} · {(octant.pct * 100).toFixed(1)}%</small>
    </button>
  );
}

function FigurePanel({
  image,
  alt,
  caption,
  className = "",
}: {
  image: { path: string; width: number; height: number };
  alt: string;
  caption: string;
  className?: string;
}) {
  const source = publicAssetPath(image.path);
  return (
    <figure className={`phenotype-figure ${className}`.trim()}>
      <a href={source} target="_blank" rel="noreferrer" aria-label={`${alt}. Open full-resolution image.`}>
        <Image src={source} width={image.width} height={image.height} sizes="(max-width: 900px) 94vw, 1200px" alt={alt} />
      </a>
      <figcaption>{caption} <a href={source} target="_blank" rel="noreferrer">Open full resolution ↗</a></figcaption>
    </figure>
  );
}

function ClusterComparisonTable({
  data,
  metricIds,
  selectedOctantId,
  onSelectOctant,
}: {
  data: PhenotypeDataset;
  metricIds: string[];
  selectedOctantId: string;
  onSelectOctant: (id: string) => void;
}) {
  const ranges = Object.fromEntries(metricIds.map((metricId) => {
    const values = data.octants.map((octant) => octant.signature[metricId].value);
    return [metricId, { minimum: Math.min(...values), maximum: Math.max(...values) }];
  }));

  return (
    <div className="cluster-matrix-scroll">
      <table className="cluster-matrix">
        <caption>Aggregate clinical measures across all eight octant phenotypes. Darker cells contain higher numeric values within that row.</caption>
        <thead>
          <tr>
            <th scope="col">Clinical measure</th>
            {data.octants.map((octant) => <th key={octant.id} scope="col" data-selected={octant.id === selectedOctantId}>
              <button type="button" onClick={() => onSelectOctant(octant.id)} aria-label={`Select ${octant.label}`}>
                <span>{octant.glyph}</span>
                <strong>{octant.label}</strong>
              </button>
            </th>)}
          </tr>
        </thead>
        <tbody>
          {metricIds.map((metricId) => {
            const metric = data.octants[0].signature[metricId];
            const range = ranges[metricId];
            return <tr key={metricId} data-domain={metric.domain}>
              <th scope="row"><strong>{metric.label}</strong><small>{metricUnit(metric)}</small></th>
              {data.octants.map((octant) => {
                const value = octant.signature[metricId];
                const relative = range.maximum === range.minimum ? 0.5 : (value.value - range.minimum) / (range.maximum - range.minimum);
                const style: CSSProperties = { backgroundColor: `rgba(34, 94, 166, ${0.07 + relative * 0.39})` };
                return <td key={octant.id} data-selected={octant.id === selectedOctantId}>
                  <button type="button" style={style} onClick={() => onSelectOctant(octant.id)} aria-label={`${value.label} in ${octant.label}: ${formatMetric(value)} ${metricUnit(value)}`}>
                    <strong>{formatMetric(value)}</strong><small>{metricUnit(value)}</small>
                  </button>
                </td>;
              })}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScoreCorrelationTable({ data }: { data: PhenotypeDataset }) {
  return (
    <div className="score-correlation">
      <div><span>Score dependence check</span><h3>Pairwise Spearman correlations</h3><p>Values near zero indicate that the three cohort scores capture largely distinct dimensions.</p></div>
      <table>
        <caption>Pairwise Spearman correlation matrix for the three phenotype scores.</caption>
        <thead><tr><th scope="col">Axis</th>{data.construction.axes.map((axis) => <th key={axis.id} scope="col">{axis.label}</th>)}</tr></thead>
        <tbody>{data.construction.axes.map((rowAxis) => <tr key={rowAxis.id}><th scope="row">{rowAxis.label}</th>{data.construction.axes.map((columnAxis) => <td key={columnAxis.id}>{data.construction.score_spearman[rowAxis.score][columnAxis.score].toFixed(2)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function SurvivalResultsTable({
  level,
  rows,
  selected,
  onSelect,
}: {
  level: OctantSurvivalLevel;
  rows: OctantSurvivalRow[];
  selected: OctantSurvivalRow | null;
  onSelect: (row: OctantSurvivalRow) => void;
}) {
  return (
    <div className="octant-results-scroll">
      <table className="octant-results-table">
        <caption>{level.label}: published octant contrasts with structured three-year endpoint data.</caption>
        <thead><tr><th scope="col">Outcome</th><th scope="col">Focal phenotype</th><th scope="col">Adjusted M4 HR (95% CI)</th><th scope="col">3-year CIF</th><th scope="col">Difference</th></tr></thead>
        <tbody>
          {rows.length ? rows.map((row) => {
            const difference = row.cif3_focal_pct - row.cif3_rest_pct;
            const isSelected = selected ? rowKey(row) === rowKey(selected) : false;
            return <tr key={rowKey(row)} data-selected={isSelected}>
              <td><button type="button" onClick={() => onSelect(row)} aria-pressed={isSelected}><strong>{row.outcome_name}</strong><small>{level.id === "phecode" ? `PheCode ${row.outcome_id}` : "Body system"}</small></button></td>
              <td>{octantLabel(row.octant)}</td>
              <td><strong>{row.hr_m4.toFixed(2)}</strong> <small>({row.ci_low.toFixed(2)}–{row.ci_high.toFixed(2)})</small></td>
              <td>{row.cif3_focal_pct.toFixed(2)}% <small>vs {row.cif3_rest_pct.toFixed(2)}%</small></td>
              <td data-direction={difference >= 0 ? "higher" : "lower"}>{difference >= 0 ? "+" : ""}{difference.toFixed(2)} pp</td>
            </tr>;
          }) : <tr><td colSpan={5} className="octant-results-empty">No published contrast matches these filters.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SurvivalSummary({
  level,
  row,
}: {
  level: OctantSurvivalLevel;
  row: OctantSurvivalRow;
}) {
  const maximum = Math.max(row.cif3_focal_pct, row.cif3_rest_pct, 1);
  const raised = row.hr_m4 >= 1;
  return (
    <article className="octant-survival-summary">
      <div className="octant-survival-summary__heading">
        <div>
          <span>{level.id === "phecode" ? `PheCode ${row.outcome_id}` : "Body-system outcome"}</span>
          <h3>{row.outcome_name}</h3>
          <p><strong>{octantLabel(row.octant)}</strong> versus the pooled other seven octants.</p>
        </div>
        <div className={raised ? "effect-badge effect-badge--raised" : "effect-badge effect-badge--lower"}>
          <span>Adjusted M4 HR</span>
          <strong>{row.hr_m4.toFixed(2)}</strong>
          <small>{row.ci_low.toFixed(2)}–{row.ci_high.toFixed(2)} · p {formatP(row.p)}</small>
        </div>
      </div>
      <div className="cif-comparison" aria-label="Three-year cumulative incidence comparison">
        <div>
          <span>Focal octant</span>
          <div className="cif-bar"><i style={{ width: `${(row.cif3_focal_pct / maximum) * 100}%` }} /></div>
          <strong>{row.cif3_focal_pct.toFixed(2)}%</strong>
          <small>{row.events_focal.toLocaleString()} events / {row.n_focal.toLocaleString()} at risk</small>
        </div>
        <div>
          <span>Other seven</span>
          <div className="cif-bar cif-bar--rest"><i style={{ width: `${(row.cif3_rest_pct / maximum) * 100}%` }} /></div>
          <strong>{row.cif3_rest_pct.toFixed(2)}%</strong>
          <small>{row.events_rest.toLocaleString()} events / {row.n_rest.toLocaleString()} at risk</small>
        </div>
      </div>
      <p className="octant-survival-summary__note">Three-year values are unadjusted Aalen–Johansen cumulative incidence. The hazard ratio is adjusted; do not interpret either as a causal treatment effect.</p>
    </article>
  );
}

export function PhenotypeExplorer({ data }: { data: PhenotypeDataset }) {
  const [selectedOctantId, setSelectedOctantId] = useState(data.octants[0]?.id ?? "");
  const [metricDomain, setMetricDomain] = useState<MetricDomainFilter>("all");
  const [levelId, setLevelId] = useState<"phecode" | "system">("phecode");
  const [survivalQuery, setSurvivalQuery] = useState("");
  const [survivalOctant, setSurvivalOctant] = useState("all");
  const [outcomeSelections, setOutcomeSelections] = useState(() => Object.fromEntries(
    data.survival.levels.map((level) => [level.id, rowKey(level.rows[0])]),
  ) as Record<"phecode" | "system", string>);

  const selectedOctant = useMemo(
    () => data.octants.find((octant) => octant.id === selectedOctantId) ?? data.octants[0]!,
    [data.octants, selectedOctantId],
  );
  const activeLevel = useMemo(
    () => data.survival.levels.find((level) => level.id === levelId) ?? data.survival.levels[0]!,
    [data.survival.levels, levelId],
  );
  const selectedSurvivalRow = useMemo(
    () => activeLevel.rows.find((row) => rowKey(row) === outcomeSelections[levelId]) ?? activeLevel.rows[0]!,
    [activeLevel, levelId, outcomeSelections],
  );
  const visibleMetricIds = useMemo(
    () => metricOrder.filter((metricId) => metricDomain === "all" || data.octants[0].signature[metricId].domain === metricDomain),
    [data.octants, metricDomain],
  );
  const availableSurvivalOctants = useMemo(
    () => Array.from(new Set(activeLevel.rows.map((row) => row.octant))).sort((left, right) => octantLabel(left).localeCompare(octantLabel(right))),
    [activeLevel.rows],
  );
  const filteredSurvivalRows = useMemo(() => {
    const query = survivalQuery.trim().toLowerCase();
    return activeLevel.rows.filter((row) => {
      const matchesOctant = survivalOctant === "all" || row.octant === survivalOctant;
      const searchText = `${row.outcome_id} ${row.outcome_name} ${row.octant}`.toLowerCase();
      return matchesOctant && (!query || searchText.includes(query));
    });
  }, [activeLevel.rows, survivalOctant, survivalQuery]);
  const displayedSurvivalRow = useMemo(
    () => filteredSurvivalRows.find((row) => rowKey(row) === rowKey(selectedSurvivalRow)) ?? filteredSurvivalRows[0] ?? null,
    [filteredSurvivalRows, selectedSurvivalRow],
  );

  function selectSurvivalRow(row: OctantSurvivalRow) {
    setOutcomeSelections((current) => ({ ...current, [levelId]: rowKey(row) }));
  }

  return (
    <main className="phenotype-page page-shell">
      <div className="breadcrumbs"><Link href="/">Atlas</Link><span>/</span><span>Phenotypes</span></div>

      <header className="phenotype-hero">
        <div>
          <div className="section-kicker">Cross-domain OSA phenotypes</div>
          <h1>Three near-independent axes. Eight octant phenotypes.</h1>
          <p>Physiologic severity, symptom burden, and comorbidity burden describe complementary dimensions of OSA. Median-splitting each cohort score produces eight near-balanced groups and classifies all {data.construction.shared_cohort_n.toLocaleString()} people in the shared phenotype cohort.</p>
        </div>
        <aside className="phenotype-legend" aria-label="Octant glyph legend">
          <span>How to read the glyph</span>
          <strong>■□□</strong>
          <p>Filled squares are above the cohort median on physiology / symptoms / comorbidity, in that order.</p>
        </aside>
      </header>

      <section className="phenotype-axis-grid" aria-label="Phenotype axes">
        {data.construction.axes.map((axis, index) => <article key={axis.id}><span>Axis {index + 1}</span><h2>{axis.label}</h2><strong>{axis.high_label}</strong><p>{axis.description}</p><code>{axis.score} cut {data.construction.cut_points[axis.score].toFixed(3)}</code></article>)}
      </section>
      <p className="phenotype-cut-note">{data.construction.cut_point_note}</p>

      <section className="octant-explorer" aria-labelledby="octant-explorer-title">
        <div className="section-heading">
          <div><span>Octant explorer</span><h2 id="octant-explorer-title">What characterizes each phenotype?</h2></div>
          <p>Select an octant to inspect its axes and aggregate clinical signature.</p>
        </div>
        <div className="octant-card-grid">
          {data.octants.map((octant) => <OctantCard key={octant.id} octant={octant} selected={octant.id === selectedOctant.id} onSelect={() => setSelectedOctantId(octant.id)} />)}
        </div>

        <article className="octant-profile" aria-live="polite">
          <div className="octant-profile__intro">
            <span className="octant-glyph">{selectedOctant.glyph}</span>
            <div><span>Selected phenotype</span><h2>{selectedOctant.label}</h2><p>{selectedOctant.summary}</p></div>
          </div>
          <div className="octant-axis-state">
            {data.construction.axes.map((axis, index) => <div key={axis.id} data-active={selectedOctant.bits[index] === 1}><span>{axis.label}</span><strong>{selectedOctant.bits[index] ? "Above median" : "Below median"}</strong></div>)}
          </div>
          <dl className="octant-headline-stats">
            <div><dt>Phenotype cohort</dt><dd>{selectedOctant.n.toLocaleString()} <small>({(selectedOctant.pct * 100).toFixed(1)}%)</small></dd></div>
            <div><dt>Median AHI</dt><dd>{selectedOctant.median_ahi.toFixed(1)} <small>events/h</small></dd></div>
            <div><dt>Median PheCodes</dt><dd>{selectedOctant.median_codes.toFixed(0)}</dd></div>
          </dl>
          <div className="metric-domain-heading"><div><span>Clinical signature</span><strong>{visibleMetricIds.length} of 17 aggregate measures</strong></div><div className="metric-domain-switch" role="group" aria-label="Clinical measure domain">{metricDomainOptions.map((option) => <button type="button" key={option.id} aria-pressed={metricDomain === option.id} onClick={() => setMetricDomain(option.id)}>{option.label}</button>)}</div></div>
          <div className="signature-metric-grid">
            {visibleMetricIds.map((metricId) => {
              const metric = selectedOctant.signature[metricId];
              return <div key={metricId} data-domain={metric.domain}><span>{metric.label}</span><strong>{formatMetric(metric)}</strong><small>{metricUnit(metric)}</small></div>;
            })}
          </div>
        </article>
      </section>

      <section className="phenotype-figures" aria-labelledby="phenotype-figures-title">
        <div className="section-heading"><div><span>Tabular cluster comparison</span><h2 id="phenotype-figures-title">Compare all eight phenotypes in native units</h2></div><p>Every value below comes from the aggregate clinical-signature table. Select any column to update the phenotype profile above.</p></div>
        <ClusterComparisonTable data={data} metricIds={visibleMetricIds} selectedOctantId={selectedOctant.id} onSelectOctant={setSelectedOctantId} />
        <ScoreCorrelationTable data={data} />
        <details className="phenotype-source-figures">
          <summary>Supplemental publication figures</summary>
          <p>The data-driven comparison above is the primary cluster view. These original figures remain available for publication context and full-resolution download.</p>
          <FigurePanel image={data.construction.image} alt="Octant construction from median splits of three nearly independent phenotype scores" caption="The three score planes are nearly uncorrelated, yielding eight groups of similar size and complete cohort coverage." />
          <FigurePanel image={data.signature_figure} alt="Heatmap of the aggregate clinical signature for each octant phenotype" caption="Clinical measurements are shown in native units; color indicates standardized contrast from the shared cohort mean." className="phenotype-figure--signature" />
        </details>
      </section>

      <section className="octant-survival" aria-labelledby="octant-survival-title">
        <div className="section-heading">
          <div><span>Octant-exposure Incidence PheDAS</span><h2 id="octant-survival-title">Incident outcomes by phenotype</h2></div>
          <p>Each contrast compares one named octant with the pooled other seven. Death is treated as a competing event.</p>
        </div>
        <div className="view-tabs octant-survival-tabs" role="group" aria-label="Octant survival outcome level">
          {data.survival.levels.map((level) => <button type="button" key={level.id} aria-pressed={levelId === level.id} onClick={() => { setLevelId(level.id); setSurvivalQuery(""); setSurvivalOctant("all"); }}>{level.label}</button>)}
        </div>
        <div className="octant-survival-controls">
          <label><span>Search outcomes</span><input type="search" value={survivalQuery} onChange={(event) => setSurvivalQuery(event.target.value)} placeholder={levelId === "phecode" ? "Name or PheCode" : "Body-system name"} /></label>
          <label><span>Focal phenotype</span><select value={survivalOctant} onChange={(event) => setSurvivalOctant(event.target.value)}><option value="all">All phenotypes</option>{availableSurvivalOctants.map((octant) => <option key={octant} value={octant}>{octantLabel(octant)}</option>)}</select></label>
          <div><strong>{filteredSurvivalRows.length} of {activeLevel.rows.length} published contrasts</strong><p>{activeLevel.description}</p></div>
        </div>
        <SurvivalResultsTable level={activeLevel} rows={filteredSurvivalRows} selected={displayedSurvivalRow} onSelect={selectSurvivalRow} />
        {displayedSurvivalRow ? <SurvivalSummary level={activeLevel} row={displayedSurvivalRow} /> : <p className="octant-detail-empty">No detail is shown because no published contrast matches the current filters.</p>}
        <div className="curve-data-limit"><strong>Why the full trajectory is still a figure</strong><p>The structured release contains each panel’s adjusted M4 estimate, counts, and three-year cumulative-incidence endpoint—but not the underlying timepoint coordinates used to draw the curve. The endpoint explorer above is fully tabular; an exact interactive curve requires a new aggregate time-series export from the secure analysis.</p></div>
        <details className="phenotype-source-figures phenotype-source-figures--survival">
          <summary>Open the supplemental full-curve publication figure</summary>
          <FigurePanel image={activeLevel.image} alt={`${activeLevel.label} cumulative-incidence curves comparing focal octants with the pooled other seven`} caption="Validated full-resolution cumulative-incidence panels. These are retained only because the current aggregate release does not include the underlying timepoint coordinates." className="phenotype-figure--survival" />
        </details>
      </section>

      <section className="curve-notes phenotype-caveats" aria-labelledby="phenotype-caveats-title">
        <div><span className="section-kicker">Interpretation guardrails</span><h2 id="phenotype-caveats-title">A taxonomy for research—not a clinical diagnostic rule</h2></div>
        <div className="curve-note-grid">{data.caveats.map((caveat, index) => <article key={caveat}><strong>{["Continuous gradients", "Contact and coding", "Adjusted comparisons", "Curve availability"][index]}</strong><p>{caveat}</p></article>)}</div>
      </section>

      <div className="phenotype-next"><div><span className="section-kicker">Related evidence</span><h2>Compare with OSA severity and landmark CPAP adherence</h2><p>The phenotype-exposure curves complement—rather than replace—the main Incidence PheDAS severity analysis.</p></div><Link href="/survival?code=401.1&amp;view=cpap&amp;window=180">Open landmark incidence curves →</Link></div>
    </main>
  );
}
