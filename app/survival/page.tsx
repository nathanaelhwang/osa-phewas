import type { Metadata } from "next";
import survivalManifestJson from "../../public/data/survival-manifest.json";
import { AtlasHeader } from "../components/AtlasHeader";
import { SurvivalExplorer } from "../components/SurvivalExplorer";
import type { SurvivalManifest } from "../survival-data";
import { normalizeSurvivalState } from "../survival-state";

export const metadata: Metadata = {
  title: "Incidence curves",
  description:
    "Explore cumulative incidence after index by OSA severity and recorded CPAP usage.",
};

export default async function SurvivalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialState = normalizeSurvivalState(await searchParams);
  return (
    <>
      <AtlasHeader />
      <SurvivalExplorer
        initialState={initialState}
        initialManifest={survivalManifestJson as unknown as SurvivalManifest}
      />
    </>
  );
}
