import { AtlasHeader } from "../components/AtlasHeader";
import { WasExplorer } from "../components/WasExplorer";
import { normalizeWasState } from "../was-state";

export default async function WasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialState = normalizeWasState(await searchParams);
  return <><AtlasHeader /><WasExplorer initialState={initialState} /></>;
}

