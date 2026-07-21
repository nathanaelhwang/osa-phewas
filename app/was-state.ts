import {
  WAS_ANALYSES,
  WAS_FAMILY_DEFAULT_ANALYSIS,
  WAS_SIGNIFICANCE,
  WAS_VIEWS,
  isDirectionalView,
  isWasAnalysisId,
  isWasFamily,
  type WasAnalysisId,
  type WasFamily,
  type WasSignificance,
  type WasView,
} from "./was-config";

export type WasState = {
  family: WasFamily;
  analysis: WasAnalysisId;
  window: string;
  model: string;
  contrast: string;
  view: WasView;
  category: string;
  significance: WasSignificance;
  stableOnly: boolean;
  query: string;
  feature?: string;
};

export const DEFAULT_WAS_STATE: WasState = {
  family: "labwas",
  analysis: "labwas_mean",
  window: "1yr",
  model: "M4",
  contrast: "severe_vs_none",
  view: "manhattan",
  category: "all",
  significance: "all",
  stableOnly: true,
  query: "",
};

const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function isOmnibusContrast(contrast: string) {
  return contrast.toLowerCase().includes("omnibus");
}

export function compatibleWasView(
  view: WasView,
  contrast: string,
  directional = true,
): WasView {
  return (!directional || isOmnibusContrast(contrast)) && isDirectionalView(view)
    ? "manhattan"
    : view;
}

export function defaultWasStateForAnalysis(analysis: WasAnalysisId): WasState {
  const config = WAS_ANALYSES[analysis];
  return {
    ...DEFAULT_WAS_STATE,
    family: config.family,
    analysis,
    window: config.defaultWindow,
    view: config.defaultView,
  };
}

export function normalizeWasState(
  raw: Record<string, string | string[] | undefined>,
): WasState {
  const requestedFamily = one(raw.family);
  const requestedAnalysis = one(raw.analysis);
  const family = isWasFamily(requestedFamily)
    ? requestedFamily
    : DEFAULT_WAS_STATE.family;
  const analysis = isWasAnalysisId(requestedAnalysis)
    ? requestedAnalysis
    : WAS_FAMILY_DEFAULT_ANALYSIS[family];
  const config = WAS_ANALYSES[analysis];
  const viewValue = one(raw.view);
  const requestedView = WAS_VIEWS.includes(viewValue as WasView)
    ? (viewValue as WasView)
    : config.defaultView;
  const significanceValue = one(raw.significance);
  const significance = WAS_SIGNIFICANCE.includes(
    significanceValue as WasSignificance,
  )
    ? (significanceValue as WasSignificance)
    : DEFAULT_WAS_STATE.significance;
  const contrast = one(raw.contrast) || DEFAULT_WAS_STATE.contrast;
  const stableValue = one(raw.stable);
  const stableOnly = stableValue === undefined
    ? DEFAULT_WAS_STATE.stableOnly
    : !["0", "false", "no"].includes(stableValue.toLowerCase());
  const feature = one(raw.feature);

  return {
    family: config.family,
    analysis,
    window: one(raw.window) || config.defaultWindow,
    model: (one(raw.model) || DEFAULT_WAS_STATE.model).toUpperCase(),
    contrast,
    view: compatibleWasView(requestedView, contrast),
    category: one(raw.category) || DEFAULT_WAS_STATE.category,
    significance,
    stableOnly,
    query: one(raw.q) || one(raw.query) || "",
    ...(feature ? { feature } : {}),
  };
}

export function wasStateToSearch(state: WasState) {
  const params = new URLSearchParams({
    family: state.family,
    analysis: state.analysis,
    window: state.window,
    model: state.model.toLowerCase(),
    contrast: state.contrast,
    view: state.view,
    category: state.category,
    significance: state.significance,
    stable: state.stableOnly ? "1" : "0",
  });
  if (state.query) params.set("q", state.query);
  if (state.feature) params.set("feature", state.feature);
  return params.toString();
}

