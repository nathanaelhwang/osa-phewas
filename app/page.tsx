import Link from "next/link";
import { AtlasHeader } from "./components/AtlasHeader";
import { FeatureSearch } from "./components/FeatureSearch";

export default function Home() {
  const families = [
    { name: "PheDAS", question: "Which diseases are already present?", measure: "OR", status: "Research preview", href: "/explore?analysis=prevalence" },
    { name: "Incidence PheDAS", question: "Which diseases arise during follow-up?", measure: "HR", status: "Research preview", href: "/explore?analysis=incidence" },
    { name: "LabWAS", question: "How do laboratory values and ordering differ?", measure: "β / OR / IRR", status: "Archived snapshot", href: "/was?family=labwas&analysis=labwas_mean" },
    { name: "MedWAS", question: "Which medication classes are filled?", measure: "OR", status: "Archived snapshot", href: "/was?family=medwas&analysis=medwas_fill" },
    { name: "BehWAS", question: "How do EHR-derived behaviors differ?", measure: "OR / β", status: "Preliminary", href: "/was?family=behwas&analysis=behwas_binary&view=forest" },
    { name: "ProcWAS", question: "How do procedure rates differ?", measure: "IRR", status: "Archived snapshot", href: "/was?family=procwas&analysis=procwas_rate" },
    { name: "UtilWAS", question: "How does healthcare use differ?", measure: "OR / IRR", status: "Review needed", href: "/was?family=utilwas&analysis=utilwas_presence" },
  ];

  return (
    <>
      <AtlasHeader />
      <main>
        <section className="hero page-shell">
          <div className="hero__eyebrow">OSA / CLINICAL PHENOME</div>
          <div className="hero__grid">
            <div>
              <h1>How is obstructive sleep apnea associated with the clinical phenome?</h1>
              <p className="hero__lede">Explore adjusted relationships between OSA severity or cross-domain phenotypes and diseases, laboratory patterns, medication fills, EHR-derived behaviors, procedures, and healthcare use in a sleep-clinic referral cohort.</p>
            </div>
            <aside className="hero__note" aria-label="Primary analysis settings">
              <span>Primary presentation</span>
              <strong>M4 · Severe vs None</strong>
              <p>M4 includes BMI. M3 remains adjacent so researchers can inspect attenuation without assigning it a causal interpretation.</p>
            </aside>
          </div>
          <FeatureSearch />
        </section>

        <section className="entry-points page-shell" aria-labelledby="entry-title">
          <div className="section-kicker">Two views of disease</div>
          <h2 id="entry-title">Start with the scientific question</h2>
          <div className="entry-grid">
            <Link className="entry-panel" href="/explore?analysis=prevalence">
              <span className="entry-panel__index">01</span>
              <div><p>Existing diagnoses</p><h3>Prevalence PheDAS</h3><span>Odds ratios across 1,700+ PheCodes</span></div>
              <b aria-hidden="true">→</b>
            </Link>
            <Link className="entry-panel" href="/explore?analysis=incidence">
              <span className="entry-panel__index">02</span>
              <div><p>New diagnoses during follow-up</p><h3>Incidence PheDAS</h3><span>Cause-specific hazard ratios across 1,000+ PheCodes</span></div>
              <b aria-hidden="true">→</b>
            </Link>
          </div>
          <div className="entry-followup-grid">
            <div className="entry-followup">
              <div>
                <span className="section-kicker">Phenotype taxonomy</span>
                <h3>Explore eight octant phenotypes</h3>
                <p>See how physiologic severity, symptoms, and comorbidity burden combine—and how the octants relate to incident outcomes.</p>
              </div>
              <Link href="/phenotypes">Explore phenotypes →</Link>
            </div>
            <div className="entry-followup">
              <div>
                <span className="section-kicker">Survival analysis</span>
                <h3>Trace cumulative incidence after index</h3>
                <p>Explore Aalen–Johansen curves by OSA severity or landmark CPAP adherence designed to address immortal-time bias.</p>
              </div>
              <Link href="/survival?code=401.1&amp;view=severity">Explore incidence curves →</Link>
            </div>
          </div>
        </section>

        <section className="atlas-index page-shell" aria-labelledby="atlas-index-title">
          <div className="section-kicker">Atlas index</div>
          <h2 id="atlas-index-title">Seven clinical lenses on OSA severity</h2>
          <div className="index-table" role="table" aria-label="Analysis family release index">
            <div className="index-row index-row--head" role="row">
              <span role="columnheader">Analysis</span><span role="columnheader">Question</span><span role="columnheader">Primary measure</span><span role="columnheader">Status</span>
            </div>
            {families.map(({ name, question, measure, status, href }) => (
              <div className="index-row" role="row" key={name}>
                <strong role="cell"><Link className="index-link" href={href}>{name} <span aria-hidden="true">→</span></Link></strong><span role="cell">{question}</span><code role="cell">{measure}</code>
                <span role="cell" className={status === "Research preview" || status === "Archived snapshot" ? "status-live" : "status-next"}>{status}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="interpretation-band">
          <div className="page-shell interpretation-band__inner">
            <strong>Interpret within the cohort.</strong>
            <p>“None” means AHI &lt;5 among referred adults with sleep studies—not a population control. These results support hypothesis generation; they do not estimate population OSA prevalence or establish causality.</p>
            <Link href="/methods">Read methods →</Link>
          </div>
        </section>
      </main>
    </>
  );
}
