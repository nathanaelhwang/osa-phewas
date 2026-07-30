export type PhenotypeAxis = {
  id: "physiologic" | "symptom" | "comorbidity";
  score: "score_c1" | "score_c2" | "score_c3";
  label: string;
  high_label: string;
  description: string;
};

export type PhenotypeMetric = {
  label: string;
  domain: "physiologic" | "symptom" | "comorbidity" | "external";
  unit: string;
  value: number;
};

export type OctantPhenotype = {
  id: string;
  label: string;
  glyph: string;
  bits: [number, number, number];
  n: number;
  pct: number;
  median_ahi: number;
  median_codes: number;
  summary: string;
  signature: Record<string, PhenotypeMetric>;
};

export type PhenotypeImage = {
  path: string;
  width: number;
  height: number;
};

export type OctantSurvivalRow = {
  outcome_id: string;
  outcome_name: string;
  octant: string;
  hr_m4: number;
  ci_low: number;
  ci_high: number;
  p: number;
  n_focal: number;
  events_focal: number;
  n_rest: number;
  events_rest: number;
  cif3_focal_pct: number;
  cif3_rest_pct: number;
};

export type OctantSurvivalLevel = {
  id: "phecode" | "system";
  label: string;
  description: string;
  image: PhenotypeImage;
  rows: OctantSurvivalRow[];
};

export type PhenotypeDataset = {
  schema_version: number;
  release: {
    id: string;
    audience: string;
    status: string;
  };
  construction: {
    shared_cohort_n: number;
    classification_coverage_pct: number;
    method: string;
    cut_points: Record<"score_c1" | "score_c2" | "score_c3", number>;
    cut_point_note: string;
    axis_order: string[];
    axes: PhenotypeAxis[];
    score_spearman: Record<string, Record<string, number>>;
    image: PhenotypeImage;
  };
  octants: OctantPhenotype[];
  signature_figure: PhenotypeImage;
  survival: {
    analysis_label: string;
    comparison: string;
    estimator: string;
    hazard_model: string;
    curve_note: string;
    time_horizon_years: number;
    levels: OctantSurvivalLevel[];
  };
  caveats: string[];
};

export function publicAssetPath(path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /^[a-z]+:/i.test(normalized)) {
    throw new Error("Phenotype data contain an unsafe public asset path.");
  }
  return `/${normalized}`;
}
