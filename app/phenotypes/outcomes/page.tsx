import type { Metadata } from "next";
import Link from "next/link";
import phenotypeDataJson from "../../../public/data/phenotypes.json";
import { AtlasHeader } from "../../components/AtlasHeader";
import { OctantSurvivalExplorer } from "../../components/OctantSurvivalExplorer";
import { PhenotypeSubnav } from "../../components/PhenotypeSubnav";
import type { PhenotypeDataset, PhenotypeOutcomesDataset } from "../../phenotype-data";

export const metadata: Metadata = {
  title: "Phenotype outcome panels",
  description:
    "Search 168 octant-exposure Incidence PheDAS panels and inspect interactive cumulative-incidence curves with adjusted M4 associations.",
};

const phenotypeData = phenotypeDataJson as unknown as PhenotypeDataset;
const outcomeData: PhenotypeOutcomesDataset = {
  octants: phenotypeData.octants,
  survival: phenotypeData.survival,
};

export default function PhenotypeOutcomesPage() {
  return (
    <>
      <AtlasHeader />
      <main className="phenotype-page page-shell">
        <div className="breadcrumbs"><Link href="/">Atlas</Link><span>/</span><Link href="/phenotypes">Phenotypes</Link><span>/</span><span>Outcome panels</span></div>
        <PhenotypeSubnav active="outcomes" />

        <header className="phenotype-outcomes-hero">
          <div>
            <div className="section-kicker">Phenotype-exposure Incidence PheDAS</div>
            <h1>Outcome panels without the long scroll.</h1>
            <p>Search by outcome, PheCode, body system, or focal octant. Compare every disclosure-safe phenotype curve with the directly estimated full-cohort reference, or return to the selected one-vs-rest contrast.</p>
          </div>
          <dl>
            <div><dt>Panels</dt><dd>{outcomeData.survival.scope.panel_count}</dd><small>one-vs-rest M4 models</small></div>
            <div><dt>Outcomes</dt><dd>{outcomeData.survival.scope.outcome_count}</dd><small>nominally omnibus-gated</small></div>
            <div><dt>Interactive curves</dt><dd>{outcomeData.survival.scope.curve_panels_available}</dd><small>{outcomeData.survival.scope.curve_panels_withheld} disclosure-withheld</small></div>
          </dl>
        </header>

        <OctantSurvivalExplorer data={outcomeData} />

        <div className="phenotype-next"><div><span className="section-kicker">Related evidence</span><h2>Compare with OSA severity and landmark CPAP adherence</h2><p>The phenotype-exposure curves complement—rather than replace—the main Incidence PheDAS severity analysis.</p></div><Link href="/survival?code=401.1&amp;view=cpap&amp;window=180">Open landmark incidence curves →</Link></div>
      </main>
    </>
  );
}
