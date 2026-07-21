import { AtlasHeader } from "../components/AtlasHeader";
import { FeatureDetail } from "../components/FeatureDetail";
import { WasFeatureDetail } from "../components/WasFeatureDetail";

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function FeaturePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const family = first(params.family);
  if (family && family !== "phedas") {
    return <><AtlasHeader /><WasFeatureDetail
      initialFamily={family}
      initialKey={first(params.key) ?? ""}
      initialWindow={first(params.window) ?? "1yr"}
      initialContrast={first(params.contrast) ?? "severe_vs_none"}
    /></>;
  }
  const code = first(params.code) ?? "401.1";
  const contrast = first(params.contrast) ?? "severe_vs_none";
  return <><AtlasHeader /><FeatureDetail initialCode={code} initialContrast={contrast} /></>;
}
