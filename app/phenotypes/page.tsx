import type { Metadata } from "next";
import phenotypeDataJson from "../../public/data/phenotypes.json";
import { AtlasHeader } from "../components/AtlasHeader";
import { PhenotypeExplorer } from "../components/PhenotypeExplorer";
import type { PhenotypeDataset, PhenotypeProfileDataset } from "../phenotype-data";

export const metadata: Metadata = {
  title: "Octant phenotypes",
  description:
    "Explore eight OSA phenotypes defined across physiologic severity, symptom burden, and comorbidity burden.",
};

const phenotypeData = phenotypeDataJson as unknown as PhenotypeDataset;
const profileData: PhenotypeProfileDataset = {
  construction: phenotypeData.construction,
  octants: phenotypeData.octants,
  cluster_profiles: phenotypeData.cluster_profiles,
  signature_figure: phenotypeData.signature_figure,
  caveats: phenotypeData.caveats,
};

export default function PhenotypesPage() {
  return (
    <>
      <AtlasHeader />
      <PhenotypeExplorer data={profileData} />
    </>
  );
}
