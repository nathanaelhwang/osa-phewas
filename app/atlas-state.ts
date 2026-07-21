export const ANALYSES = ["prevalence", "incidence"] as const;
export const MODELS = ["M1", "M2", "M3", "M4"] as const;
export const VIEWS = ["manhattan", "volcano", "table"] as const;

export type Analysis = (typeof ANALYSES)[number];
export type Model = (typeof MODELS)[number];
export type View = (typeof VIEWS)[number];

export type AtlasState = {
  analysis: Analysis;
  contrast: string;
  model: Model;
  view: View;
  significance: "all" | "fdr" | "bonferroni";
  feature?: string;
};

export const DEFAULT_ATLAS_STATE: AtlasState = {
  analysis: "prevalence",
  contrast: "severe_vs_none",
  model: "M4",
  view: "manhattan",
  significance: "all",
};

export const CONTRASTS: Record<Analysis, readonly string[]> = {
  prevalence: [
    "severe_vs_none",
    "moderate_vs_none",
    "mild_vs_none",
    "ahi_ge15",
    "ahi_ge5",
  ],
  incidence: [
    "severe_vs_none",
    "moderate_vs_none",
    "mild_vs_none",
    "trend",
    "ahi_ge15",
    "ahi_ge5",
    "omnibus",
  ],
};

export const CONTRAST_LABELS: Record<string, string> = {
  severe_vs_none: "Severe vs None",
  moderate_vs_none: "Moderate vs None",
  mild_vs_none: "Mild vs None",
  trend: "Severity trend",
  ahi_ge15: "AHI ≥15 vs <15",
  ahi_ge5: "AHI ≥5 vs <5",
  omnibus: "Any severity difference",
};

export const MODEL_LABELS: Record<Model, string> = {
  M1: "M1 · crude",
  M2: "M2 · demographics",
  M3: "M3 · excludes BMI",
  M4: "M4 · + BMI · primary",
};

const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function normalizeAtlasState(
  raw: Record<string, string | string[] | undefined>,
): AtlasState {
  const analysisValue = one(raw.analysis ?? raw.family);
  const analysis = ANALYSES.includes(analysisValue as Analysis)
    ? (analysisValue as Analysis)
    : DEFAULT_ATLAS_STATE.analysis;
  const modelValue = one(raw.model)?.toUpperCase();
  const model = MODELS.includes(modelValue as Model)
    ? (modelValue as Model)
    : DEFAULT_ATLAS_STATE.model;
  const contrastValue = one(raw.contrast);
  const contrast = CONTRASTS[analysis].includes(contrastValue ?? "")
    ? (contrastValue as string)
    : DEFAULT_ATLAS_STATE.contrast;
  const viewValue = one(raw.view);
  const view = VIEWS.includes(viewValue as View)
    ? (viewValue as View)
    : DEFAULT_ATLAS_STATE.view;
  const significanceValue = one(raw.significance);
  const significance = ["all", "fdr", "bonferroni"].includes(
    significanceValue ?? "",
  )
    ? (significanceValue as AtlasState["significance"])
    : DEFAULT_ATLAS_STATE.significance;
  const feature = one(raw.feature);

  return {
    analysis,
    model,
    contrast,
    view,
    significance,
    ...(feature ? { feature } : {}),
  };
}

export function atlasStateToSearch(state: AtlasState) {
  const params = new URLSearchParams({
    analysis: state.analysis,
    contrast: state.contrast,
    model: state.model.toLowerCase(),
    view: state.view,
    significance: state.significance,
  });
  if (state.feature) params.set("feature", state.feature);
  return params.toString();
}

