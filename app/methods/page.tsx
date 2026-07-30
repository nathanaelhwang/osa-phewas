import Link from "next/link";
import { AtlasHeader } from "../components/AtlasHeader";

const models = [
  ["M1", "Crude", "Unadjusted association model."],
  ["M2", "Demographics", "Adds demographic adjustment."],
  [
    "M3",
    "Extended · excludes BMI",
    "Adds family-specific adjustment while excluding BMI. Incidence PheDAS M3 also includes baseline encounter rate.",
  ],
  [
    "M4",
    "Primary · adds BMI",
    "Adds BMI to M3. M3 remains adjacent because BMI may be treated as a confounder or as part of the pathway, depending on the scientific question.",
  ],
];

const releaseRoadmap = [
  ["Prevalence PheDAS", "Existing disease · OR", "Research preview"],
  ["Incidence PheDAS", "New-onset disease · HR", "Research preview"],
  ["LabWAS", "Values, ordering propensity, and ordering rate", "Archived snapshot"],
  ["MedWAS", "Medication fills · OR", "Archived snapshot"],
  ["BehWAS", "EHR-derived behaviors · OR or β", "Preliminary archived"],
  ["ProcWAS", "Procedure rates · IRR", "Archived snapshot"],
  ["UtilWAS", "Healthcare-use presence and counts", "Archived review"],
];

const otherFamilies = [
  ["LabWAS", "β / OR / IRR", "Mean and median value betas use rank-inverse-normal standard-deviation units and condition on being tested. Ordering propensity and ordering rate remain separate extensive and intensive signals."],
  ["MedWAS", "OR", "Binary ever-filled medication classes use zero-preserved GPI-4 codes. Fallback class labels remain visibly marked for review."],
  ["BehWAS", "OR or β", "Binary and rank-inverse-normal standardized continuous representations remain on separate axes. This small curated scan is preliminary and forest-first."],
  ["ProcWAS", "IRR", "Procedure counts are annualized rates over one- and five-year pre-index windows; sleep-study and PAP-pathway procedures were excluded."],
  ["UtilWAS", "OR / IRR", "Presence and count among present are a two-part analysis. Physician and allied-health definitions must not be summed while their overlap rule remains under review."],
];

export default function MethodsPage() {
  return (
    <>
      <AtlasHeader />
      <main className="feature-page page-shell">
        <div className="breadcrumbs">
          <Link href="/">Atlas</Link>
          <span>/</span>
          <span>Methods &amp; interpretation</span>
        </div>

        <section className="feature-title" aria-labelledby="methods-title">
          <div>
            <div className="section-kicker">Research guide</div>
            <h1 id="methods-title">Methods &amp; interpretation</h1>
            <p>
              How to read OSA associations across disease endpoints, adjustment
              models, statistical flags, and staged atlas releases.
            </p>
          </div>
          <aside className="hero__note" aria-label="Primary atlas settings">
            <span>Primary presentation</span>
            <strong>M4 · Severe vs None</strong>
            <p>
              In PheDAS, M4 includes BMI. M3 is kept one step away so researchers
              can inspect attenuation without assigning BMI a causal role.
            </p>
          </aside>
        </section>

        <section className="evidence-section" aria-labelledby="cohort-title">
          <div className="section-heading">
            <div>
              <span>Study frame</span>
              <h2 id="cohort-title">Cohort, reference, and time direction</h2>
            </div>
            <p>Interpret every estimate within the sleep-clinic referral cohort.</p>
          </div>
          <div className="definition-grid">
            <article>
              <span>Reference</span>
              <h2>“None” means AHI &lt;5</h2>
              <p>
                The reference group comprises referred adults with sleep studies
                and AHI below 5. It is not a population-level healthy control.
                Severe versus None is the default pairwise contrast.
              </p>
            </article>
            <article>
              <span>Prevalence PheDAS</span>
              <h2>Disease already present</h2>
              <p>
                L1-regularized logistic models summarize disease presence before
                index as odds ratios. Estimates are shrunk and intervals are
                non-classical; they should be labeled accordingly.
              </p>
            </article>
            <article>
              <span>Incidence PheDAS</span>
              <h2>Disease arising during follow-up</h2>
              <p>
                Ridge cause-specific Cox models follow at-risk participants after
                index and report hazard ratios. At-risk counts, event counts, and
                proportional-hazards diagnostics belong with each result.
              </p>
            </article>
          </div>
          <p className="method-callout">
            Odds ratios and hazard ratios answer different questions. They are
            shown in separate views and should not be compared as though they
            were the same estimand.
          </p>
        </section>

        <section className="evidence-section" aria-labelledby="phenotype-methods-title">
          <div className="section-heading">
            <div>
              <span>Cross-domain OSA phenotypes</span>
              <h2 id="phenotype-methods-title">Three gradients combined into eight octants</h2>
            </div>
            <p>The taxonomy separates physiologic severity, symptom burden, and coded comorbidity burden.</p>
          </div>
          <div className="definition-grid">
            <article>
              <span>Domain models</span>
              <h2>Complementary latent axes</h2>
              <p>
                Model-derived scores summarize sleep-study physiology, symptoms,
                and comorbidities. The axes are nearly independent and should be
                described as regions of continuous gradients—not biological
                subpopulations.
              </p>
            </article>
            <article>
              <span>Octant construction</span>
              <h2>Median split × three axes</h2>
              <p>
                Each score is split at its shared-cohort median, classifying all
                70,880 people into eight near-balanced groups. The three-square
                glyph records whether physiology, symptoms, and comorbidity are
                above the median, in that order.
              </p>
            </article>
            <article>
              <span>Interpretation</span>
              <h2>Cohort-specific research taxonomy</h2>
              <p>
                Cut points are not clinical thresholds and do not transfer
                unchanged. The comorbidity axis also reflects healthcare contact
                and record completeness; downstream M4 models adjust for age and
                sex because octants are strongly structured by both.
              </p>
            </article>
          </div>
          <div className="definition-grid">
            <article>
              <span>Cluster summaries</span>
              <h2>Measure-specific denominators</h2>
              <p>
                The phenotype explorer reports 26 aggregate measures with their
                own coverage. Follow-up and encounter measures cover the 25,380-person
                IncWAS spine; age, BMI, and sex cover 53,012 people. The displayed
                standardized difference is the octant estimate minus the containing
                cohort estimate, divided by cohort SD—not a two-independent-group SMD.
              </p>
            </article>
            <article>
              <span>Octant-exposure model</span>
              <h2>M4 ridge Cox</h2>
              <p>
                Each focal octant is compared with the pooled other seven. M4 adjusts
                for an age spline, sex, study year, race/ethnicity, smoking, income,
                baseline observation and encounter measures, and BMI. CPAP is not
                adjusted because it is treated as a mediator.
              </p>
            </article>
            <article>
              <span>Hierarchical testing</span>
              <h2>Omnibus gate, then one-vs-rest</h2>
              <p>
                All eight contrasts are shown only for outcomes whose 7-df M4 omnibus
                test reached nominal p &lt; 0.05. Within each focal-octant contrast,
                Bonferroni uses 0.05/15 for gated PheCodes and 0.05/6 for gated systems;
                it is not 0.05/168.
              </p>
            </article>
          </div>
          <p className="method-callout">
            Octant cumulative-incidence curves are unadjusted tie-aware Aalen–Johansen
            estimates with death competing; M4 hazard ratios are adjusted estimates from
            a separate model. Mean follow-up is 1.42 years and only 8.7% of the pooled
            baseline risk set remains observed at year 3. Eighty of 168 panels have EPV
            below 10, and proportional-hazards diagnostics were not computed for any
            octant model.
          </p>
          <p className="method-callout">
            CPAP initiation/adherence distributions are omitted because capture and
            units do not support a defensible denominator. Race/ethnicity remains an M4
            adjustment covariate, but its descriptive octant breakdown is not published
            because one cell is below the disclosure threshold and release is not approved.
            Curve coordinates are withheld for the 16 panels whose focal event count is
            suppressed below 11.
          </p>
          <Link className="primary-link" href="/phenotypes">
            Explore octant phenotypes →
          </Link>
        </section>

        <section className="evidence-section" aria-labelledby="curves-methods-title">
          <div className="section-heading">
            <div>
              <span>Incidence PheDAS survival analysis</span>
              <h2 id="curves-methods-title">Cumulative incidence, with death treated as competing</h2>
            </div>
            <p>The curves describe absolute observed incidence; they are not M4-adjusted hazard ratios.</p>
          </div>
          <div className="definition-grid">
            <article>
              <span>Estimator</span>
              <h2>Aalen–Johansen curves</h2>
              <p>
                Severity curves report cumulative incidence from index through six
                years. Landmark CPAP curves report five years from index plus the
                selected grace period. Both treat death as a competing event and do
                not use one minus Kaplan–Meier.
              </p>
            </article>
            <article>
              <span>Outcome selection</span>
              <h2>Post-selection description</h2>
              <p>
                Curves are available for the 40 PheCodes that were FDR-significant
                in at least one M4 OSA-severity contrast, including one visibly
                labeled OSA-recoding control. The curves describe those selected
                outcomes; they are not independent confirmation.
              </p>
            </article>
            <article>
              <span>Landmark CPAP adherence</span>
              <h2>Landmark-based, still descriptive</h2>
              <p>
                The 90- and 180-day grace-period landmarks require OSA patients to
                remain observed and event-free to the landmark, then restart the
                analysis clock. This design addresses immortal-time bias. It does not remove
                healthy-adherer confounding, so curves remain associational rather
                than treatment effects; 180 days is the primary view.
              </p>
            </article>
          </div>
          <p className="method-callout">
            Aggregate cumulative-incidence percentages are released publicly.
            Exact monthly at-risk and cumulative-event arrays, uncertainty bands,
            and curve downloads remain outside the browser bundle. Follow-up ends
            May 31, 2023, and late curve tails may be supported by thinner risk sets.
          </p>
          <Link className="primary-link" href="/survival?code=401.1&amp;view=severity">
            Explore cumulative incidence curves →
          </Link>
        </section>

        <section className="atlas-index" aria-labelledby="models-title">
          <div className="section-kicker">PheDAS adjustment ladder</div>
          <h2 id="models-title">Read disease-model M1 through M4 as a sequence</h2>
          <div className="index-table" role="table" aria-label="PheDAS adjustment model definitions">
            <div className="index-row index-row--head" role="row">
              <span role="columnheader">Model</span>
              <span role="columnheader">Framing</span>
              <span role="columnheader">Interpretation</span>
              <span role="columnheader">Display</span>
            </div>
            {models.map(([model, framing, interpretation]) => (
              <div className="index-row" role="row" key={model}>
                <strong role="cell">{model}</strong>
                <span role="cell">{framing}</span>
                <span role="cell">{interpretation}</span>
                <span
                  role="cell"
                  className={model === "M4" ? "status-live" : "status-next"}
                >
                  {model === "M4" ? "Primary" : model === "M3" ? "Adjacent" : "Comparison"}
                </span>
              </div>
            ))}
          </div>
          <p className="method-callout">
            Model labels are family-specific. Other WAS views therefore retain
            neutral M1-M4 identifiers and do not assume that their covariate sets
            are interchangeable with PheDAS.
          </p>
        </section>

        <section className="evidence-section" aria-labelledby="quality-title">
          <div className="section-heading">
            <div>
              <span>Statistical reading</span>
              <h2 id="quality-title">Multiplicity, diagnostics, and uncertainty</h2>
            </div>
            <p>Significance is context for an estimate, not a scientific conclusion.</p>
          </div>
          <div className="definition-grid">
            <article>
              <span>Multiplicity</span>
              <h2>Keep correction families intact</h2>
              <p>
                Current disease outputs expose FDR and Bonferroni significance
                flags. Exact adjusted q-values are not generally available. The
                atlas does not infer one global correction across incompatible
                analyses, models, or contrasts.
              </p>
            </article>
            <article>
              <span>Quality flags</span>
              <h2>Warnings stay visible</h2>
              <p>
                Unstable estimates remain labeled rather than silently removed.
                Incidence results additionally expose event-per-variable warnings
                and proportional-hazards diagnostic information where available.
              </p>
            </article>
            <article>
              <span>Scientific language</span>
              <h2>Association, not causation</h2>
              <p>
                Results support hypothesis generation. They do not establish
                causal, protective, or independent risk effects, and they do not
                estimate population OSA prevalence.
              </p>
            </article>
          </div>
        </section>

        <section className="atlas-index" aria-labelledby="other-methods-title">
          <div className="section-kicker">Other association families</div>
          <h2 id="other-methods-title">Keep each clinical signal on its native scale</h2>
          <div className="index-table index-table--methods" role="table" aria-label="Non-disease analysis interpretation">
            <div className="index-row index-row--head" role="row">
              <span role="columnheader">Analysis</span>
              <span role="columnheader">Estimand</span>
              <span role="columnheader">Interpretation rule</span>
              <span role="columnheader">Default</span>
            </div>
            {otherFamilies.map(([family, effect, interpretation]) => (
              <div className="index-row" role="row" key={family}>
                <strong role="cell">{family}</strong>
                <code role="cell">{effect}</code>
                <span role="cell">{interpretation}</span>
                <span role="cell" className="status-live">M4 · Severe vs None</span>
              </div>
            ))}
          </div>
          <p className="method-callout">
            Omnibus rows are non-directional Wald statistics. They appear only
            in Manhattan and table views, never on a signed volcano or forest axis.
          </p>
        </section>

        <section className="atlas-index" aria-labelledby="release-title">
          <div className="section-kicker">Release roadmap</div>
          <h2 id="release-title">Seven clinical lenses, released in stages</h2>
          <div className="index-table" role="table" aria-label="Analysis family release roadmap">
            <div className="index-row index-row--head" role="row">
              <span role="columnheader">Analysis</span>
              <span role="columnheader">Scientific focus</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Release rule</span>
            </div>
            {releaseRoadmap.map(([family, focus, status]) => (
              <div className="index-row" role="row" key={family}>
                <strong role="cell">{family}</strong>
                <span role="cell">{focus}</span>
                <span
                  role="cell"
                  className={status === "Research preview" ? "status-live" : "status-next"}
                >
                  {status}
                </span>
                <span role="cell">
                  {status === "Research preview"
                    ? "Disease scan"
                    : "Visible with snapshot or review warning"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="related-evidence" aria-labelledby="release-gate-title">
          <div>
            <span className="section-kicker">Aggregate-only release gate</span>
            <h2 id="release-gate-title">The browser never runs patient-level analyses</h2>
            <p>
              This research preview consumes only allowlisted, precomputed
              aggregate results. The prevalence PheDAS association table does
              not contain cases and non-cases for each PheCode within each OSA
              severity or contrast group. A total cohort size cannot substitute
              for those cells: without them, a release process cannot identify
              rare endpoints, apply the approved small-cell threshold, or test
              complementary disclosure across related tables.
            </p>
            <p>
              The required companion should be keyed to the result version and
              include analytic N, cases, non-cases, excluded or missing counts,
              OSA-group counts, and a policy-approved suppression decision.
              Until that join exists, public downloads and deployment remain gated.
            </p>
          </div>
          <div className="related-tags" aria-label="Release safeguards">
            <span>Aggregate results</span>
            <span>Schema checked</span>
            <span>Provenance retained</span>
            <span>Disclosure pending</span>
          </div>
        </section>

        <section className="interpretation-band" aria-label="Methods navigation">
          <div className="interpretation-band__inner">
            <strong>Ready to explore?</strong>
            <p>
              Begin with the primary M4 Severe-versus-None view, then inspect M3
              and the alternate contrasts before drawing a scientific conclusion.
            </p>
            <Link href="/was?family=labwas&amp;analysis=labwas_mean&amp;model=m4&amp;contrast=severe_vs_none">
              Explore other WAS families →
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
