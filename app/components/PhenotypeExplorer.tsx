"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
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
  "epworth",
  "isi",
  "distinct_phecodes",
  "index_ahi",
];

function formatMetric(metric: PhenotypeMetric) {
  if (metric.unit === "proportion") return `${(metric.value * 100).toFixed(0)}%`;
  if (metric.unit === "fraction") return metric.value.toFixed(3);
  if (metric.unit === "count") return metric.value.toFixed(0);
  return metric.value.toFixed(metric.value >= 10 ? 1 : 2);
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
          <p><strong>{row.octant.replaceAll("-", " ")}</strong> versus the pooled other seven octants.</p>
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
  const [levelId, setLevelId] = useState<"phecode" | "system">("phecode");
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
          <div className="signature-metric-grid">
            {metricOrder.map((metricId) => {
              const metric = selectedOctant.signature[metricId];
              return <div key={metricId} data-domain={metric.domain}><span>{metric.label}</span><strong>{formatMetric(metric)}</strong><small>{metric.unit}</small></div>;
            })}
          </div>
        </article>
      </section>

      <section className="phenotype-figures" aria-labelledby="phenotype-figures-title">
        <div className="section-heading"><div><span>Construction and signature</span><h2 id="phenotype-figures-title">The axes stay distinct; their combinations stay interpretable</h2></div><p>Identity is encoded by the three-square glyph, not by color alone.</p></div>
        <FigurePanel image={data.construction.image} alt="Octant construction from median splits of three nearly independent phenotype scores" caption="The three score planes are nearly uncorrelated, yielding eight groups of similar size and complete cohort coverage." />
        <FigurePanel image={data.signature_figure} alt="Heatmap of the aggregate clinical signature for each octant phenotype" caption="Clinical measurements are shown in native units; color indicates standardized contrast from the shared cohort mean." className="phenotype-figure--signature" />
      </section>

      <section className="octant-survival" aria-labelledby="octant-survival-title">
        <div className="section-heading">
          <div><span>Octant-exposure Incidence PheDAS</span><h2 id="octant-survival-title">Incident outcomes by phenotype</h2></div>
          <p>Each contrast compares one named octant with the pooled other seven. Death is treated as a competing event.</p>
        </div>
        <div className="view-tabs octant-survival-tabs" role="group" aria-label="Octant survival outcome level">
          {data.survival.levels.map((level) => <button type="button" key={level.id} aria-pressed={levelId === level.id} onClick={() => setLevelId(level.id)}>{level.label}</button>)}
        </div>
        <div className="octant-survival-controls">
          <label>Outcome and focal octant<select value={rowKey(selectedSurvivalRow)} onChange={(event) => setOutcomeSelections((current) => ({ ...current, [levelId]: event.target.value }))}>{activeLevel.rows.map((row) => <option key={rowKey(row)} value={rowKey(row)}>{row.outcome_name} · {row.octant.replaceAll("-", " ")}</option>)}</select></label>
          <p>{activeLevel.description}</p>
        </div>
        <SurvivalSummary level={activeLevel} row={selectedSurvivalRow} />
        <FigurePanel image={activeLevel.image} alt={`${activeLevel.label} cumulative-incidence curves comparing focal octants with the pooled other seven`} caption="Validated full-resolution cumulative-incidence panels. The public release includes structured three-year summaries, but not aggregate monthly points for browser-redrawn curves." className="phenotype-figure--survival" />
      </section>

      <section className="curve-notes phenotype-caveats" aria-labelledby="phenotype-caveats-title">
        <div><span className="section-kicker">Interpretation guardrails</span><h2 id="phenotype-caveats-title">A taxonomy for research—not a clinical diagnostic rule</h2></div>
        <div className="curve-note-grid">{data.caveats.map((caveat, index) => <article key={caveat}><strong>{["Continuous gradients", "Contact and coding", "Adjusted comparisons", "Curve availability"][index]}</strong><p>{caveat}</p></article>)}</div>
      </section>

      <div className="phenotype-next"><div><span className="section-kicker">Related evidence</span><h2>Compare with OSA severity and landmark CPAP adherence</h2><p>The phenotype-exposure curves complement—rather than replace—the main Incidence PheDAS severity analysis.</p></div><Link href="/survival?code=401.1&amp;view=cpap&amp;window=180">Open landmark incidence curves →</Link></div>
    </main>
  );
}
