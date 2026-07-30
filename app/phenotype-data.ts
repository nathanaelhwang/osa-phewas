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

export type CpapTreatmentWindowId =
  | "index"
  | "90-days"
  | "180-days"
  | "365-days"
  | "observed-follow-up";

export type CpapTreatmentWindow = {
  id: CpapTreatmentWindowId;
  days: number | null;
  label: string;
  source_definition: string;
  denominator_note: string;
};

export type CpapTreatmentRow = {
  group_id: string;
  window_id: CpapTreatmentWindowId;
  n_octant: number;
  n_observable: number;
  n_record_present: number;
  record_coverage_pct: number;
  n_documented_setup: number;
  documented_setup_pct: number;
  n_adherence_data: number | null;
  n_adherence_missing: number | null;
  adherence_data_coverage_pct: number | null;
  n_usage_data: number | null;
  usage_data_coverage_pct: number | null;
  availability_suppressed: boolean;
};

export type PhenotypeCpapTreatment = {
  analysis_label: string;
  default_window_id: CpapTreatmentWindowId;
  default_note: string;
  windows: CpapTreatmentWindow[];
  rows: CpapTreatmentRow[];
  measure_status: {
    adherence_outcome: { status: "unavailable"; label: string; reason: string };
    usage_distribution: {
      status: "unavailable";
      label: string;
      source_unit: "minutes";
      reason: string;
    };
  };
  interpretation: {
    setup: string;
    record: string;
    denominator: string;
    availability: string;
  };
  disclosure: {
    threshold: number;
    suppressed_rows: number;
    suppressed_exact_count_cells: number;
    rule: string;
    audit_status: "PASS";
  };
  release: {
    status: "approved_for_public_website";
    approved_on: string;
    summary_sha256: string;
  };
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
  schema_version: 3;
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
  cpap_treatment: PhenotypeCpapTreatment;
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

export type PhenotypeProfileDataset = Pick<
  PhenotypeDataset,
  "construction" | "octants" | "cluster_profiles" | "cpap_treatment" | "signature_figure" | "caveats"
>;

export type PhenotypeOutcomesDataset = Pick<PhenotypeDataset, "octants" | "survival">;

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

export type PhenotypeOverallMetadata = {
  n_at_risk_baseline: number;
  total_events: null;
  cif3_pct: number;
  mean_followup_years: number;
  n_at_risk_3yr: number;
  pct_baseline_at_risk_3yr: number;
  curve_status: "available";
  suppressed: false;
  event_counts_withheld: true;
  event_count_withholding_reason: string;
  event_definition: string;
  estimator: string;
  competing_event: string;
  time_origin: string;
};

export type PhenotypeOverallCurve = {
  curve_status: "available";
  curve: PhenotypeCurveSeries;
  risk_table: PhenotypeRiskRow[];
  metadata: PhenotypeOverallMetadata;
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
  schema_version: 2;
  level: "phecode" | "system";
  outcome_id: string;
  outcome_name: string;
  category: string;
  overall: PhenotypeOverallCurve;
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

function assertCurveSeries(value: unknown, context: string): PhenotypeCurveSeries {
  if (!isRecord(value)) throw new Error(`${context} is missing.`);
  const times = assertNumericSeries(value.time_years, `${context} times`);
  const values = assertNumericSeries(value.cif_pct, `${context} cumulative incidence`);
  if (
    times[0] !== 0 ||
    times.at(-1) !== 3 ||
    times.some((time, index) => index > 0 && time <= times[index - 1]) ||
    values.some((item) => item < 0 || item > 100) ||
    values.some((item, index) => index > 0 && item + 1e-10 < values[index - 1])
  ) {
    throw new Error(`${context} contains values outside the released range.`);
  }
  return value as unknown as PhenotypeCurveSeries;
}

function assertRiskTable(value: unknown, context: string): PhenotypeRiskRow[] {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error(`${context} is not a valid annual risk table.`);
  }
  const expectedTimes = [0, 1, 2, 3];
  const rows = value.map((row, index) => {
    if (
      !isRecord(row) ||
      row.time_years !== expectedTimes[index] ||
      !Number.isInteger(row.n_at_risk) ||
      (row.n_at_risk as number) < 11 ||
      (row.n_events_cum !== null &&
        (!Number.isInteger(row.n_events_cum) || (row.n_events_cum as number) < 11)) ||
      typeof row.suppressed !== "boolean" ||
      row.suppressed !== (row.n_events_cum === null)
    ) {
      throw new Error(`${context} contains an invalid or undisclosed count.`);
    }
    return row as unknown as PhenotypeRiskRow;
  });
  if (rows.some((row, index) => index > 0 && row.n_at_risk > rows[index - 1].n_at_risk)) {
    throw new Error(`${context} contains an increasing risk set.`);
  }
  const disclosedEvents = rows.flatMap((row) =>
    row.n_events_cum === null ? [] : [row.n_events_cum],
  );
  if (disclosedEvents.some((events, index) => index > 0 && events < disclosedEvents[index - 1])) {
    throw new Error(`${context} contains a decreasing cumulative event count.`);
  }
  return rows;
}

function assertOverallCurve(value: unknown): PhenotypeOverallCurve {
  if (!isRecord(value) || value.curve_status !== "available") {
    throw new Error("The phenotype curve asset is missing the pooled-cohort curve.");
  }
  const curve = assertCurveSeries(value.curve, "Pooled-cohort curve");
  const riskTable = assertRiskTable(value.risk_table, "Pooled-cohort risk table");
  if (riskTable.some((row) => row.n_events_cum !== null || !row.suppressed)) {
    throw new Error("Pooled-cohort event counts are not complementarily suppressed.");
  }
  const metadata = value.metadata;
  if (!isRecord(metadata)) {
    throw new Error("The pooled-cohort curve is missing metadata.");
  }
  const numericFields = [
    "n_at_risk_baseline",
    "cif3_pct",
    "mean_followup_years",
    "n_at_risk_3yr",
    "pct_baseline_at_risk_3yr",
  ] as const;
  const textFields = ["event_definition", "estimator", "competing_event", "time_origin"] as const;
  if (
    numericFields.some(
      (field) => typeof metadata[field] !== "number" || !Number.isFinite(metadata[field]),
    ) ||
    textFields.some((field) => typeof metadata[field] !== "string" || !metadata[field]) ||
    metadata.curve_status !== "available" ||
    metadata.suppressed !== false ||
    metadata.total_events !== null ||
    metadata.event_counts_withheld !== true ||
    metadata.event_count_withholding_reason !==
      "Complementary suppression prevents reconstruction of rare focal event counts." ||
    !Number.isInteger(metadata.n_at_risk_baseline) ||
    !Number.isInteger(metadata.n_at_risk_3yr) ||
    (metadata.n_at_risk_baseline as number) < 11 ||
    (metadata.n_at_risk_3yr as number) < 11 ||
    (metadata.n_at_risk_3yr as number) > (metadata.n_at_risk_baseline as number) ||
    (metadata.cif3_pct as number) < 0 ||
    (metadata.cif3_pct as number) > 100 ||
    (metadata.mean_followup_years as number) < 0 ||
    (metadata.mean_followup_years as number) > 3 ||
    (metadata.pct_baseline_at_risk_3yr as number) < 0 ||
    (metadata.pct_baseline_at_risk_3yr as number) > 100
  ) {
    throw new Error("The pooled-cohort curve metadata are invalid.");
  }
  if (
    Math.abs(curve.cif_pct.at(-1)! - (metadata.cif3_pct as number)) > 0.0001 ||
    riskTable[0].n_at_risk !== metadata.n_at_risk_baseline ||
    riskTable.at(-1)!.n_at_risk !== metadata.n_at_risk_3yr
  ) {
    throw new Error("The pooled-cohort curve does not reconcile with its metadata.");
  }
  return value as unknown as PhenotypeOverallCurve;
}

function validateCurvePayload(
  value: unknown,
  expected: OctantSurvivalOutcome,
  expectedLevel: OctantSurvivalLevel["id"],
): PhenotypeSurvivalOutcomePayload {
  if (
    !isRecord(value) ||
    value.schema_version !== 2 ||
    value.level !== expectedLevel ||
    value.outcome_id !== expected.outcome_id ||
    value.outcome_name !== expected.outcome_name ||
    value.category !== expected.category
  ) {
    throw new Error("The phenotype curve asset does not match the selected outcome.");
  }
  assertOverallCurve(value.overall);
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
      assertRiskTable(rawPanel.risk_table[group], "Phenotype-panel risk table");
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
      assertCurveSeries(series, "Phenotype-panel curve");
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
