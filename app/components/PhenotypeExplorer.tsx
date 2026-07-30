"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import {
  publicAssetPath,
  type CpapTreatmentRow,
  type CpapTreatmentWindowId,
  type DistributionSummary,
  type OctantPhenotype,
  type PhenotypeMetric,
  type PhenotypeMetricDomain,
  type PhenotypeProfileDataset,
} from "../phenotype-data";
import { PhenotypeSubnav } from "./PhenotypeSubnav";

type MetricDomainFilter = "all" | PhenotypeMetricDomain;

const metricDomainOptions: Array<{ id: MetricDomainFilter; label: string }> = [
  { id: "all", label: "All measures" },
  { id: "physiologic", label: "Physiology" },
  { id: "symptom", label: "Symptoms" },
  { id: "comorbidity", label: "Comorbidity" },
  { id: "external", label: "AHI / severity" },
  { id: "demographic", label: "Demographic" },
  { id: "follow-up", label: "Follow-up" },
  { id: "utilisation", label: "Utilization" },
];

function formatValue(metric: PhenotypeMetric, value: number) {
  if (metric.metric_type === "binary" || metric.unit === "proportion" || metric.unit === "fraction") {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (metric.unit === "count") return value.toFixed(0);
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 2);
}

function displayUnit(metric: PhenotypeMetric) {
  if (metric.metric_type === "binary" || metric.unit === "proportion" || metric.unit === "fraction") return "";
  return metric.unit;
}

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} SD`;
}

function CpapCoverage({
  count,
  percentage,
  denominator,
  compact = false,
}: {
  count: number | null;
  percentage: number | null;
  denominator: number;
  compact?: boolean;
}) {
  if (count === null || percentage === null) {
    return <span className="phenotype-cpap-suppressed">Suppressed (&lt;11)</span>;
  }
  return compact ? (
    <><strong>{percentage.toFixed(1)}%</strong><small>{count.toLocaleString()} / {denominator.toLocaleString()}</small></>
  ) : (
    <><strong>{percentage.toFixed(1)}%</strong><span>{count.toLocaleString()} of {denominator.toLocaleString()}</span></>
  );
}

function CpapComparisonRow({
  row,
  octant,
  selected,
  onSelect,
}: {
  row: CpapTreatmentRow;
  octant: OctantPhenotype | undefined;
  selected: boolean;
  onSelect: (() => void) | undefined;
}) {
  const label = octant?.label ?? "All phenotypes";
  return (
    <tr data-selected={selected} data-reference={!octant}>
      <th scope="row">
        {octant && onSelect ? (
          <button type="button" onClick={onSelect} aria-label={`Select ${label}`}>
            <span>{octant.glyph}</span><strong>{label}</strong>
          </button>
        ) : (
          <div><span>ALL</span><strong>{label}</strong></div>
        )}
      </th>
      <td>{row.n_observable.toLocaleString()}</td>
      <td>
        <div className="phenotype-cpap-bar" aria-label={`${row.documented_setup_pct.toFixed(1)}%, ${row.n_documented_setup.toLocaleString()} of ${row.n_observable.toLocaleString()}`}>
          <i style={{ width: `${row.documented_setup_pct}%` }} />
          <CpapCoverage count={row.n_documented_setup} percentage={row.documented_setup_pct} denominator={row.n_observable} compact />
        </div>
      </td>
      <td><CpapCoverage count={row.n_record_present} percentage={row.record_coverage_pct} denominator={row.n_observable} compact /></td>
      <td><CpapCoverage count={row.n_adherence_data} percentage={row.adherence_data_coverage_pct} denominator={row.n_documented_setup} compact /></td>
      <td><CpapCoverage count={row.n_usage_data} percentage={row.usage_data_coverage_pct} denominator={row.n_documented_setup} compact /></td>
    </tr>
  );
}

function matrixStyle(value: number): CSSProperties {
  const magnitude = Math.min(Math.abs(value) / 1.5, 1);
  const alpha = 0.07 + magnitude * 0.42;
  return {
    backgroundColor: value >= 0
      ? `rgba(224, 103, 45, ${alpha})`
      : `rgba(46, 105, 164, ${alpha})`,
  };
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

function MetricDetail({
  metric,
  summary,
}: {
  metric: PhenotypeMetric;
  summary: DistributionSummary;
}) {
  const unit = displayUnit(metric);
  return (
    <article className="phenotype-metric-card" data-domain={metric.domain}>
      <header>
        <div><span>{metric.domain.replace("-", " ")}</span><h3>{metric.label}</h3></div>
        <strong>{formatValue(metric, summary.estimate)}{unit ? <small> {unit}</small> : null}</strong>
      </header>
      <div className="phenotype-metric-difference" data-direction={summary.standardized_difference >= 0 ? "higher" : "lower"}>
        <strong>{formatSigned(summary.standardized_difference)}</strong>
        <span>from the containing cohort</span>
      </div>
      {metric.metric_type === "continuous" ? (
        <dl>
          <div><dt>Mean ± SD</dt><dd>{formatValue(metric, summary.mean!)} ± {formatValue(metric, summary.sd!)}</dd></div>
          <div><dt>Median [Q1–Q3]</dt><dd>{formatValue(metric, summary.median!)} [{formatValue(metric, summary.q1!)}–{formatValue(metric, summary.q3!)}]</dd></div>
          <div><dt>Cohort mean</dt><dd>{formatValue(metric, summary.cohort_estimate)}</dd></div>
        </dl>
      ) : (
        <dl>
          <div><dt>Count / denominator</dt><dd>{summary.numerator!.toLocaleString()} / {summary.denominator!.toLocaleString()}</dd></div>
          <div><dt>Cohort proportion</dt><dd>{formatValue(metric, summary.cohort_estimate)}</dd></div>
        </dl>
      )}
      <footer><span>Coverage</span><strong>{summary.coverage_pct.toFixed(1)}%</strong><small>n = {summary.n_nonmissing.toLocaleString()}</small></footer>
    </article>
  );
}

function ClusterComparisonTable({
  data,
  metrics,
  selectedOctantId,
  onSelectOctant,
}: {
  data: PhenotypeProfileDataset;
  metrics: PhenotypeMetric[];
  selectedOctantId: string;
  onSelectOctant: (id: string) => void;
}) {
  return (
    <div className="cluster-matrix-scroll">
      <table className="cluster-matrix cluster-matrix--diverging">
        <caption>Aggregate cluster measures. Cell text is in native units; color is the standardized difference from the containing cohort.</caption>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            {data.octants.map((octant) => (
              <th key={octant.id} scope="col" data-selected={octant.id === selectedOctantId}>
                <button type="button" onClick={() => onSelectOctant(octant.id)} aria-label={`Select ${octant.label}`}>
                  <span>{octant.glyph}</span>
                  <strong>{octant.label}</strong>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric.id} data-domain={metric.domain}>
              <th scope="row"><strong>{metric.label}</strong><small>{displayUnit(metric) || "proportion"}</small></th>
              {data.octants.map((octant) => {
                const summary = metric.by_octant[octant.id];
                return (
                  <td key={octant.id} data-selected={octant.id === selectedOctantId}>
                    <button
                      type="button"
                      style={matrixStyle(summary.standardized_difference)}
                      onClick={() => onSelectOctant(octant.id)}
                      aria-label={`${metric.label} in ${octant.label}: ${formatValue(metric, summary.estimate)}; ${formatSigned(summary.standardized_difference)} from the cohort`}
                    >
                      <strong>{formatValue(metric, summary.estimate)}</strong>
                      <small>{formatSigned(summary.standardized_difference)}</small>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoreCorrelationTable({ data }: { data: PhenotypeProfileDataset }) {
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

export function PhenotypeExplorer({ data }: { data: PhenotypeProfileDataset }) {
  const [selectedOctantId, setSelectedOctantId] = useState(data.octants[0]?.id ?? "");
  const [selectedCpapWindowId, setSelectedCpapWindowId] = useState<CpapTreatmentWindowId>(data.cpap_treatment.default_window_id);
  const [metricDomain, setMetricDomain] = useState<MetricDomainFilter>("all");
  const [metricQuery, setMetricQuery] = useState("");

  const selectedOctant = data.octants.find((octant) => octant.id === selectedOctantId) ?? data.octants[0]!;
  const selectedCpapWindow = data.cpap_treatment.windows.find((window) => window.id === selectedCpapWindowId) ?? data.cpap_treatment.windows[0]!;
  const cpapRows = data.cpap_treatment.rows.filter((row) => row.window_id === selectedCpapWindow.id);
  const selectedCpapRow = cpapRows.find((row) => row.group_id === selectedOctant.id) ?? cpapRows[0]!;
  const visibleMetrics = useMemo(() => {
    const needle = metricQuery.trim().toLowerCase();
    return data.cluster_profiles.metrics.filter((metric) => {
      const domainMatch = metricDomain === "all" || metric.domain === metricDomain;
      return domainMatch && (!needle || `${metric.label} ${metric.domain} ${metric.unit}`.toLowerCase().includes(needle));
    });
  }, [data.cluster_profiles.metrics, metricDomain, metricQuery]);

  return (
    <main className="phenotype-page page-shell">
      <div className="breadcrumbs"><Link href="/">Atlas</Link><span>/</span><span>Phenotypes</span></div>
      <PhenotypeSubnav active="profiles" />

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
        {data.construction.axes.map((axis, index) => (
          <article key={axis.id}><span>Axis {index + 1}</span><h2>{axis.label}</h2><strong>{axis.high_label}</strong><p>{axis.description}</p><code>{axis.score} cut {data.construction.cut_points[axis.score].toFixed(3)}</code></article>
        ))}
      </section>
      <p className="phenotype-cut-note">{data.construction.cut_point_note}</p>

      <section className="octant-explorer" aria-labelledby="octant-explorer-title">
        <div className="section-heading">
          <div><span>Octant explorer</span><h2 id="octant-explorer-title">What characterizes each phenotype?</h2></div>
          <p>Select an octant, then search or filter 26 aggregate measures to inspect its distribution and coverage.</p>
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

          <div className="metric-domain-heading metric-domain-heading--searchable">
            <div><span>Aggregate phenotype profile</span><strong>{visibleMetrics.length} of {data.cluster_profiles.metrics.length} measures</strong></div>
            <label><span>Find a measure</span><input type="search" value={metricQuery} onChange={(event) => setMetricQuery(event.target.value)} placeholder="Try hypertension, BMI, or sleepiness" /></label>
          </div>
          <div className="metric-domain-switch" role="group" aria-label="Clinical measure domain">
            {metricDomainOptions.map((option) => <button type="button" key={option.id} aria-pressed={metricDomain === option.id} onClick={() => setMetricDomain(option.id)}>{option.label}</button>)}
          </div>
          <div className="phenotype-metric-grid">
            {visibleMetrics.map((metric) => <MetricDetail key={metric.id} metric={metric} summary={metric.by_octant[selectedOctant.id]} />)}
          </div>
          {!visibleMetrics.length ? <p className="phenotype-metric-empty">No aggregate measure matches this search and domain.</p> : null}
        </article>
      </section>

      <section className="phenotype-cpap" aria-labelledby="phenotype-cpap-title">
        <div className="section-heading">
          <div><span>CPAP treatment documentation</span><h2 id="phenotype-cpap-title">Documented PAP setup by phenotype</h2></div>
          <p>This section summarizes documented setup signals in the retained CPAP extract. It does not estimate true treatment initiation, uptake, adherence, or effectiveness.</p>
        </div>

        <div className="phenotype-cpap-window-switch" role="group" aria-label="Documented PAP setup window">
          {data.cpap_treatment.windows.map((window) => (
            <button type="button" key={window.id} aria-pressed={window.id === selectedCpapWindow.id} onClick={() => setSelectedCpapWindowId(window.id)}>
              {window.label}
            </button>
          ))}
        </div>
        <div className="phenotype-cpap-window-note" aria-live="polite">
          <strong>{selectedCpapWindow.source_definition}</strong>
          <span>{selectedCpapWindow.denominator_note}</span>
          {selectedCpapWindow.id === data.cpap_treatment.default_window_id ? <small>{data.cpap_treatment.default_note}</small> : null}
        </div>

        <article className="phenotype-cpap-selected" aria-live="polite">
          <header>
            <span className="octant-glyph">{selectedOctant.glyph}</span>
            <div><span>Selected phenotype</span><h3>{selectedOctant.label}</h3><p>{selectedCpapWindow.label} view, {selectedCpapRow.n_observable.toLocaleString()} observable through this window</p></div>
          </header>
          <div className="phenotype-cpap-metrics">
            <div data-primary="true"><span>Documented PAP setup signal</span><CpapCoverage count={selectedCpapRow.n_documented_setup} percentage={selectedCpapRow.documented_setup_pct} denominator={selectedCpapRow.n_observable} /></div>
            <div><span>Retained CPAP record</span><CpapCoverage count={selectedCpapRow.n_record_present} percentage={selectedCpapRow.record_coverage_pct} denominator={selectedCpapRow.n_observable} /></div>
            <div><span>Adherence data available</span><CpapCoverage count={selectedCpapRow.n_adherence_data} percentage={selectedCpapRow.adherence_data_coverage_pct} denominator={selectedCpapRow.n_documented_setup} /></div>
            <div><span>Usage measure available</span><CpapCoverage count={selectedCpapRow.n_usage_data} percentage={selectedCpapRow.usage_data_coverage_pct} denominator={selectedCpapRow.n_documented_setup} /></div>
          </div>
        </article>

        <div className="phenotype-cpap-unavailable">
          <article><span>Outcome not released</span><h3>{data.cpap_treatment.measure_status.adherence_outcome.label}</h3><p>{data.cpap_treatment.measure_status.adherence_outcome.reason}</p></article>
          <article><span>Distribution not released</span><h3>{data.cpap_treatment.measure_status.usage_distribution.label}</h3><p>{data.cpap_treatment.measure_status.usage_distribution.reason}</p></article>
        </div>

        <div className="phenotype-cpap-table-wrap">
          <table className="phenotype-cpap-table">
            <caption>All-phenotype comparison for {selectedCpapWindow.label}. Availability percentages use documented setups as their denominator.</caption>
            <thead><tr><th scope="col">Phenotype</th><th scope="col">Observable</th><th scope="col">Documented setup</th><th scope="col">Retained record</th><th scope="col">Adherence data</th><th scope="col">Usage data</th></tr></thead>
            <tbody>
              {cpapRows.map((row) => {
                const octant = data.octants.find((candidate) => candidate.id === row.group_id);
                return <CpapComparisonRow key={row.group_id} row={row} octant={octant} selected={row.group_id === selectedOctant.id} onSelect={octant ? () => setSelectedOctantId(octant.id) : undefined} />;
              })}
            </tbody>
          </table>
        </div>

        <details className="phenotype-cpap-notes">
          <summary>Definitions and interpretation limits</summary>
          <div><p>{data.cpap_treatment.interpretation.setup}</p><p>{data.cpap_treatment.interpretation.record}</p><p>{data.cpap_treatment.interpretation.denominator}</p><p>{data.cpap_treatment.interpretation.availability}</p><p>{data.cpap_treatment.disclosure.rule}</p></div>
        </details>
      </section>

      <section className="phenotype-figures" aria-labelledby="phenotype-figures-title">
        <div className="section-heading"><div><span>Cluster comparison</span><h2 id="phenotype-figures-title">Compare all eight phenotypes in native units</h2></div><p>Blue cells are below and orange cells above the containing cohort. Select any column to update the profile.</p></div>
        <div className="cluster-matrix-key" aria-label="Standardized difference color key"><span>− Lower than cohort</span><i /><span>Higher than cohort +</span></div>
        <ClusterComparisonTable data={data} metrics={visibleMetrics} selectedOctantId={selectedOctant.id} onSelectOctant={setSelectedOctantId} />
        <p className="cluster-matrix-note">Standardized difference means group estimate minus cohort estimate, divided by the cohort SD. Each octant is part of that cohort; this is not a two-independent-group standardized mean difference. Coverage is shown on every profile card.</p>
        <ScoreCorrelationTable data={data} />
        <details className="phenotype-source-figures">
          <summary>Supplemental phenotype-construction figures</summary>
          <p>The data-driven comparison above is the primary cluster view. These source figures remain available for publication context and full-resolution download.</p>
          <FigurePanel image={data.construction.image} alt="Octant construction from median splits of three nearly independent phenotype scores" caption="The three score planes are nearly uncorrelated, yielding eight groups of similar size and complete cohort coverage." />
          <FigurePanel image={data.signature_figure} alt="Heatmap of the aggregate clinical signature for each octant phenotype" caption="The source clinical-signature figure is retained as a supplement; the interactive table above includes the expanded 26-measure export." className="phenotype-figure--signature" />
        </details>
      </section>

      <section className="curve-notes phenotype-caveats" aria-labelledby="phenotype-caveats-title">
        <div><span className="section-kicker">Interpretation guardrails</span><h2 id="phenotype-caveats-title">A research taxonomy—not a clinical diagnostic rule</h2></div>
        <div className="curve-note-grid">{data.caveats.map((caveat) => <article key={caveat.title}><strong>{caveat.title}</strong><p>{caveat.text}</p></article>)}</div>
      </section>

      <div className="phenotype-next"><div><span className="section-kicker">Phenotype outcomes</span><h2>Continue to the incident-outcome panels</h2><p>Search all 168 octant–outcome models and open the interactive cumulative-incidence curves on their dedicated page.</p></div><Link href="/phenotypes/outcomes">Open outcome panels →</Link></div>
    </main>
  );
}
