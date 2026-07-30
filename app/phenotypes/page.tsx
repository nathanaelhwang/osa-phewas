import type { Metadata } from "next";
import phenotypeDataJson from "../../public/data/phenotypes.json";
import { AtlasHeader } from "../components/AtlasHeader";
import { PhenotypeExplorer } from "../components/PhenotypeExplorer";
import type { PhenotypeDataset } from "../phenotype-data";

export const metadata: Metadata = {
  title: "Octant phenotypes",
  description:
    "Explore eight OSA phenotypes defined across physiologic severity, symptom burden, and comorbidity burden, plus their incident-outcome curves.",
};

export default function PhenotypesPage() {
  return (
    <>
      <AtlasHeader />
      <PhenotypeExplorer data={phenotypeDataJson as unknown as PhenotypeDataset} />
    </>
  );
}
