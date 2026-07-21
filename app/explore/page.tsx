import { AtlasHeader } from "../components/AtlasHeader";
import { AtlasExplorer } from "../components/AtlasExplorer";
import { normalizeAtlasState } from "../atlas-state";

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const initialState = normalizeAtlasState(await searchParams);
  return <><AtlasHeader /><AtlasExplorer initialState={initialState} /></>;
}

