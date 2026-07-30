export type PhenotypeAxis = {
  id: "physiologic" | "symptom" | "comorbidity";
  score: "score_c1" | "score_c2" | "score_c3";
  label: string;
  high_label: string;
  description: string;
};

export type DistributionSummary = {
  n_nonmissing: number;
  coverage_pct: number;
  estimate: number;
  mean: number | null;
  sd: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  numerator: number | null;
  denominator: number | null;
  proportion: number | null;
  cohort_estimate: number;
  standardized_difference: number;
  suppressed: boolean;
};

export type PhenotypeMetricDomain =
  | "physiologic"
  | "symptom"
  | "comorbidity"
  | "external"
  | "demographic"
  | "follow-up"
  | "utilisation";

export type PhenotypeMetric = {
  id: string;
  label: string;
  domain: PhenotypeMetricDomain;
  metric_type: "continuous" | "binary";
  unit: string;
  overall: DistributionSummary;
  by_octant: Record<string, DistributionSummary>;
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
};

export type PhenotypeImage = {
  path: string;
  width: number;
  height: number;
};

export type OctantSurvivalPanel = {
  octant: string;
  contrast: string;
  model: "M4";
  hr_m4: number;
  se: number;
  ci_low: number;
  ci_high: number;
  p: number;
  q_fdr: number;
  sig_fdr: boolean;
  sig_bon: boolean;
  omnibus_p_m4: number;
  omnibus_q_m4: number;
  omnibus_sig_fdr: boolean;
  n_focal: number;
  events_focal: number | null;
  n_rest: number;
  events_rest: number | null;
  cif3_focal_pct: number;
  cif3_rest_pct: number;
  penalizer: number;
  unstable: "epv<10" | null;
  ph_p: null;
  currently_published: boolean;
  suppressed: boolean;
  curve_available: boolean;
};

export type OctantSurvivalOutcome = {
  outcome_id: string;
  outcome_name: string;
  category: string;
  asset_path: string;
  panels: OctantSurvivalPanel[];
};

export type OctantSurvivalLevel = {
  id: "phecode" | "system";
  label: string;
  description: string;
  panel_count: number;
  outcomes: OctantSurvivalOutcome[];
  image: PhenotypeImage;
};

export type PhenotypeDataset = {
  schema_version: 2;
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
  cluster_profiles: {
    metrics: PhenotypeMetric[];
    standardized_difference_definition: string;
    estimate_note: string;
  };
  signature_figure: PhenotypeImage;
  survival: {
    analysis_label: string;
    comparison: string;
    estimator: string;
    hazard_model: string;
    curve_note: string;
    time_horizon_years: number;
    risk_table_times_years: number[];
    scope: {
      panel_count: number;
      outcome_count: number;
      phecode_panels: number;
      system_panels: number;
      fdr_panels: number;
      bonferroni_panels: number;
      curve_panels_available: number;
      curve_panels_withheld: number;
    };
    testing: {
      gate: string;
      bonferroni: string;
      fdr: string;
    };
    model: {
      label: string;
      penalizer: number;
      covariates: string[];
      cpap_note: string;
      ph_note: string;
    };
    tail_warning: string;
    disclosure: {
      threshold: number;
      rule: string;
      curve_rule: string;
      manifest_correction: string;
    };
    levels: OctantSurvivalLevel[];
  };
  caveats: Array<{ title: string; text: string }>;
};

export type PhenotypeCurveSeries = {
  time_years: number[];
  cif_pct: number[];
};

export type PhenotypeRiskRow = {
  time_years: number;
  n_at_risk: number;
  n_events_cum: number | null;
  suppressed: boolean;
};

type PhenotypeCurvePanelBase = {
  octant: string;
  risk_table: Record<"focal" | "other_seven", PhenotypeRiskRow[]>;
};

export type PhenotypeCurvePanel = PhenotypeCurvePanelBase & (
  | {
      curve_status: "available";
      curves: Record<"focal" | "other_seven", PhenotypeCurveSeries>;
    }
  | {
      curve_status: "withheld_event_count_suppression";
      curves: null;
    }
);

export type PhenotypeSurvivalOutcomePayload = {
  schema_version: 1;
  level: "phecode" | "system";
  outcome_id: string;
  outcome_name: string;
  category: string;
  panels: PhenotypeCurvePanel[];
};

export function publicAssetPath(path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /^[a-z]+:/i.test(normalized)) {
    throw new Error("Phenotype data contain an unsafe public asset path.");
  }
  return `/${normalized}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNumericSeries(value: unknown, context: string) {
  if (!Array.isArray(value) || value.length !== 120 || !value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    throw new Error(`${context} is not a valid 120-point numeric series.`);
  }
  return value as number[];
}

function validateCurvePayload(
  value: unknown,
  expected: OctantSurvivalOutcome,
  expectedLevel: OctantSurvivalLevel["id"],
): PhenotypeSurvivalOutcomePayload {
  if (!isRecord(value) || value.schema_version !== 1 || value.level !== expectedLevel || value.outcome_id !== expected.outcome_id) {
    throw new Error("The phenotype curve asset does not match the selected outcome.");
  }
  if (!Array.isArray(value.panels) || value.panels.length !== 8) {
    throw new Error("The phenotype curve asset does not contain all eight octants.");
  }
  const expectedOctants = new Set(expected.panels.map((panel) => panel.octant));
  const seen = new Set<string>();
  for (const rawPanel of value.panels) {
    if (!isRecord(rawPanel) || typeof rawPanel.octant !== "string" || !expectedOctants.has(rawPanel.octant) || seen.has(rawPanel.octant)) {
      throw new Error("The phenotype curve asset contains an invalid octant panel.");
    }
    seen.add(rawPanel.octant);
    if (!isRecord(rawPanel.risk_table)) {
      throw new Error("The phenotype curve asset is missing an annual risk table.");
    }
    for (const group of ["focal", "other_seven"] as const) {
      const rows = rawPanel.risk_table[group];
      if (!Array.isArray(rows) || rows.length !== 4) {
        throw new Error("The phenotype curve asset has an invalid annual risk table.");
      }
    }
    if (rawPanel.curve_status === "withheld_event_count_suppression") {
      if (rawPanel.curves !== null) throw new Error("A withheld phenotype curve unexpectedly contains coordinates.");
      continue;
    }
    if (rawPanel.curve_status !== "available" || !isRecord(rawPanel.curves)) {
      throw new Error("The phenotype curve asset has an invalid curve status.");
    }
    for (const group of ["focal", "other_seven"] as const) {
      const series = rawPanel.curves[group];
      if (!isRecord(series)) throw new Error("The phenotype curve asset is missing a curve series.");
      const times = assertNumericSeries(series.time_years, "Curve times");
      const values = assertNumericSeries(series.cif_pct, "Cumulative incidence");
      if (times[0] !== 0 || times.at(-1) !== 3 || values.some((item) => item < 0 || item > 100)) {
        throw new Error("The phenotype curve asset contains values outside the released range.");
      }
    }
  }
  return value as unknown as PhenotypeSurvivalOutcomePayload;
}

export async function fetchPhenotypeSurvivalOutcome(
  level: OctantSurvivalLevel["id"],
  outcome: OctantSurvivalOutcome,
  signal?: AbortSignal,
) {
  if (!new RegExp(`^data/phenotype-survival/${level}/[a-z0-9-]+\\.json$`).test(outcome.asset_path)) {
    throw new Error("The selected phenotype outcome has an unsafe curve asset path.");
  }
  const response = await fetch(publicAssetPath(outcome.asset_path), { signal });
  if (!response.ok) throw new Error(`Curve asset request failed (${response.status}).`);
  return validateCurvePayload(await response.json(), outcome, level);
}
