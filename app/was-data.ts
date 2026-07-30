import type { WasAnalysisId, WasFamily } from "./was-config";
import type { WasState } from "./was-state";

export type WasEffectScale = "ratio" | "difference" | "omnibus" | string;

export type WasPartitionMetadata = {
  analysis_id: WasAnalysisId;
  family: WasFamily;
  label: string;
  window: string;
  model: string;
  contrast: string;
  effect_type: string;
  effect_scale: WasEffectScale;
  neutral_value: number;
  directional: boolean;
  code_system: string;
  row_count: number;
  release_status: string;
  release_note: string;
  sample_n_label: string;
  secondary_n_label: string;
};

export type WasPartitionRef = WasPartitionMetadata & {
  path: string;
};

export type WasManifestAnalysis = {
  analysis_id: WasAnalysisId;
  family?: WasFamily;
  label?: string;
  [key: string]: unknown;
};

export type WasUtilizationMetricId =
  | "outpatient_rate"
  | "inpatient_rate"
  | "hospital_los_days"
  | "ed_rate"
  | "urgent_care_rate"
  | "primary_care_rate"
  | "specialty_rate";

export type WasUtilizationSeverity = "Overall" | "None" | "Mild" | "Moderate" | "Severe";

export type WasUtilizationProfileRef = {
  path: string;
  row_count: number;
  release_status: string;
  release_note: string;
  windows: string[];
  severities: WasUtilizationSeverity[];
};

export type WasManifest = {
  schema_version?: number;
  analyses: WasManifestAnalysis[];
  partitions: WasPartitionRef[];
  utilization_profile?: WasUtilizationProfileRef;
  [key: string]: unknown;
};

export type WasUtilizationProfileRow = {
  metric_id: WasUtilizationMetricId;
  metric_label: string;
  window: string;
  severity: WasUtilizationSeverity;
  n_denominator: number;
  n_nonmissing: number;
  n_with_use: number;
  mean: number | null;
  sd: number | null;
  median: number | null;
  unit: string;
  denominator_definition: string;
  metric_definition: string;
  suppressed: boolean;
  suppression_reason: string | null;
};

export type WasUtilizationProfileMetadata = {
  dataset: string;
  generated_at_utc: string;
  row_count: number;
  release_status: string;
  release_note: string;
  release_approved: boolean;
  public_website_release_approved: boolean;
  disclosure_threshold: number;
  windows: string[];
  severities: WasUtilizationSeverity[];
  window_definitions: Record<string, string>;
  rate_denominator_definition: string;
  los_denominator_definition: string;
  primary_care_specialty_list: string[];
  specialty_care_definition: string;
  ed_inpatient_overlap_warning: string;
};

export type WasUtilizationProfilePayload = {
  metadata: WasUtilizationProfileMetadata;
  rows: WasUtilizationProfileRow[];
};

export type WasAssociationRow = {
  feature_key: string;
  feature_id: string;
  feature_name: string;
  category: string;
  subgroup: string;
  effect_type: string;
  effect: number | null;
  se: number | null;
  ci_low: number | null;
  ci_high: number | null;
  p: number | null;
  neglog10p: number | null;
  sig_fdr: boolean;
  sig_bon: boolean;
  unstable: boolean;
  unstable_reason: string | null;
  n: number | null;
  n_secondary: number | null;
  prevalence: number | null;
  label_review_required: boolean;
  referral_item: boolean;
};

export type WasPartitionPayload = {
  metadata: WasPartitionMetadata;
  rows: WasAssociationRow[];
};

type RawPartitionRef = Partial<WasPartitionMetadata> & {
  path?: unknown;
  metadata?: Partial<WasPartitionMetadata>;
};

type RawPartitionPayload = {
  metadata?: Partial<WasPartitionMetadata>;
  columns?: Record<string, unknown[]>;
};

function toBoolean(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || !value) {
    throw new Error(`WAS manifest is missing ${field}.`);
  }
  return value;
}

function normalizePartitionRef(raw: RawPartitionRef): WasPartitionRef {
  const metadata = { ...raw, ...(raw.metadata ?? {}) };
  const neutral = Number(metadata.neutral_value);
  const rowCount = Number(metadata.row_count);
  return {
    path: requireString(raw.path, "partition path"),
    analysis_id: requireString(metadata.analysis_id, "analysis_id") as WasAnalysisId,
    family: requireString(metadata.family, "family") as WasFamily,
    label: requireString(metadata.label, "label"),
    window: requireString(metadata.window, "window"),
    model: requireString(metadata.model, "model").toUpperCase(),
    contrast: requireString(metadata.contrast, "contrast"),
    effect_type: requireString(metadata.effect_type, "effect_type"),
    effect_scale: requireString(metadata.effect_scale, "effect_scale"),
    neutral_value: Number.isFinite(neutral) ? neutral : 0,
    directional: toBoolean(metadata.directional),
    code_system: requireString(metadata.code_system, "code_system"),
    row_count: Number.isFinite(rowCount) ? rowCount : 0,
    release_status: requireString(metadata.release_status, "release_status"),
    release_note: typeof metadata.release_note === "string" ? metadata.release_note : "",
    sample_n_label: typeof metadata.sample_n_label === "string" && metadata.sample_n_label
      ? metadata.sample_n_label
      : "Analytic N",
    secondary_n_label: typeof metadata.secondary_n_label === "string"
      ? metadata.secondary_n_label
      : "",
  };
}

function normalizeAnalysis(raw: unknown): WasManifestAnalysis {
  if (typeof raw === "string") return { analysis_id: raw as WasAnalysisId };
  if (!raw || typeof raw !== "object") {
    throw new Error("WAS manifest contains an invalid analysis entry.");
  }
  const entry = raw as Record<string, unknown>;
  const analysisId = entry.analysis_id ?? entry.id;
  return {
    ...entry,
    analysis_id: requireString(analysisId, "analysis_id") as WasAnalysisId,
    ...(typeof entry.family === "string" ? { family: entry.family as WasFamily } : {}),
    ...(typeof entry.label === "string" ? { label: entry.label } : {}),
  };
}

function normalizeUtilizationProfileRef(raw: unknown): WasUtilizationProfileRef {
  if (!raw || typeof raw !== "object") {
    throw new Error("WAS manifest contains an invalid utilization profile reference.");
  }
  const entry = raw as Record<string, unknown>;
  const rowCount = Number(entry.row_count);
  const windows = Array.isArray(entry.windows) ? entry.windows.map(String) : [];
  const severities = Array.isArray(entry.severities) ? entry.severities.map(String) : [];
  if (!Number.isInteger(rowCount) || rowCount !== 70 || windows.length !== 2 || severities.length !== 5) {
    throw new Error("WAS manifest contains an incomplete utilization profile reference.");
  }
  return {
    path: requireString(entry.path, "utilization profile path"),
    row_count: rowCount,
    release_status: requireString(entry.release_status, "utilization profile release_status"),
    release_note: typeof entry.release_note === "string" ? entry.release_note : "",
    windows,
    severities: severities as WasUtilizationSeverity[],
  };
}

export async function fetchWasManifest(): Promise<WasManifest> {
  const response = await fetch("/data/was-manifest.json");
  if (!response.ok) {
    throw new Error(`WAS manifest is unavailable (${response.status}).`);
  }
  const raw = await response.json() as {
    schema_version?: number;
    analyses?: unknown[];
    partitions?: RawPartitionRef[];
    utilization_profile?: unknown;
    [key: string]: unknown;
  };
  if (!Array.isArray(raw.analyses) || !Array.isArray(raw.partitions)) {
    throw new Error("WAS manifest has an invalid shape.");
  }
  const { utilization_profile: rawProfile, ...manifestFields } = raw;
  return {
    ...manifestFields,
    analyses: raw.analyses.map(normalizeAnalysis),
    partitions: raw.partitions.map(normalizePartitionRef),
    ...(rawProfile === undefined
      ? {}
      : { utilization_profile: normalizeUtilizationProfileRef(rawProfile) }),
  };
}

function safeDataUrl(path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+/, "");
  if (normalized.includes("..") || /^[a-z]+:/i.test(normalized)) {
    throw new Error("WAS manifest contains an unsafe partition path.");
  }
  return normalized.startsWith("data/") ? `/${normalized}` : `/data/${normalized}`;
}

const utilizationMetricIds = new Set<WasUtilizationMetricId>([
  "outpatient_rate",
  "inpatient_rate",
  "hospital_los_days",
  "ed_rate",
  "urgent_care_rate",
  "primary_care_rate",
  "specialty_rate",
]);
const utilizationSeverities = new Set<WasUtilizationSeverity>([
  "Overall",
  "None",
  "Mild",
  "Moderate",
  "Severe",
]);

function requiredColumn(columns: Record<string, unknown[]>, field: string, rowCount: number) {
  const values = columns[field];
  if (!Array.isArray(values) || values.length !== rowCount) {
    throw new Error(`Utilization profile has an invalid ${field} column.`);
  }
  return values;
}

function requiredCount(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Utilization profile contains an invalid ${field}.`);
  }
  return parsed;
}

export async function fetchWasUtilizationProfile(
  profileRef: WasUtilizationProfileRef,
): Promise<WasUtilizationProfilePayload> {
  const response = await fetch(safeDataUrl(profileRef.path));
  if (!response.ok) {
    throw new Error(`Utilization profile is unavailable (${response.status}).`);
  }
  const raw = await response.json() as {
    schema_version?: unknown;
    metadata?: Record<string, unknown>;
    columns?: Record<string, unknown[]>;
  };
  if (raw.schema_version !== 1 || !raw.metadata || !raw.columns) {
    throw new Error("Utilization profile has an invalid shape.");
  }
  const metadata = raw.metadata;
  const rowCount = requiredCount(metadata.row_count, "row_count");
  if (rowCount !== profileRef.row_count || metadata.release_approved !== true ||
      metadata.public_website_release_approved !== true) {
    throw new Error("Utilization profile is not approved for this release.");
  }

  const fields = [
    "metric_id", "metric_label", "window", "severity", "n_denominator",
    "n_nonmissing", "n_with_use", "mean", "sd", "median", "unit",
    "denominator_definition", "metric_definition", "suppressed", "suppression_reason",
  ];
  const columns = Object.fromEntries(
    fields.map((field) => [field, requiredColumn(raw.columns!, field, rowCount)]),
  ) as Record<string, unknown[]>;
  const seen = new Set<string>();
  const rows = Array.from({ length: rowCount }, (_, index): WasUtilizationProfileRow => {
    const metricId = String(columns.metric_id[index]) as WasUtilizationMetricId;
    const severity = String(columns.severity[index]) as WasUtilizationSeverity;
    const window = String(columns.window[index]);
    if (!utilizationMetricIds.has(metricId) || !utilizationSeverities.has(severity) ||
        !["1yr", "5yr"].includes(window)) {
      throw new Error("Utilization profile contains an unsupported key.");
    }
    const key = `${metricId}|${window}|${severity}`;
    if (seen.has(key)) throw new Error("Utilization profile contains a duplicate row.");
    seen.add(key);
    const suppressed = columns.suppressed[index] === true;
    const mean = toNullableNumber(columns.mean[index]);
    const sd = toNullableNumber(columns.sd[index]);
    const median = toNullableNumber(columns.median[index]);
    if ((!suppressed && [mean, sd, median].some((value) => value === null)) ||
        (suppressed && [mean, sd, median].some((value) => value !== null))) {
      throw new Error("Utilization profile contains inconsistent suppressed statistics.");
    }
    return {
      metric_id: metricId,
      metric_label: requireString(columns.metric_label[index], "utilization metric_label"),
      window,
      severity,
      n_denominator: requiredCount(columns.n_denominator[index], "n_denominator"),
      n_nonmissing: requiredCount(columns.n_nonmissing[index], "n_nonmissing"),
      n_with_use: requiredCount(columns.n_with_use[index], "n_with_use"),
      mean,
      sd,
      median,
      unit: requireString(columns.unit[index], "utilization unit"),
      denominator_definition: requireString(
        columns.denominator_definition[index],
        "utilization denominator_definition",
      ),
      metric_definition: requireString(columns.metric_definition[index], "utilization metric_definition"),
      suppressed,
      suppression_reason: columns.suppression_reason[index]
        ? String(columns.suppression_reason[index])
        : null,
    };
  });
  if (seen.size !== 70) throw new Error("Utilization profile grid is incomplete.");

  const severities = Array.isArray(metadata.severities)
    ? metadata.severities.map(String) as WasUtilizationSeverity[]
    : [];
  const primaryCare = Array.isArray(metadata.primary_care_specialty_list)
    ? metadata.primary_care_specialty_list.map(String)
    : [];
  if (severities.length !== 5 || primaryCare.length === 0) {
    throw new Error("Utilization profile metadata are incomplete.");
  }
  return {
    metadata: {
      dataset: requireString(metadata.dataset, "utilization dataset"),
      generated_at_utc: requireString(metadata.generated_at_utc, "utilization generated_at_utc"),
      row_count: rowCount,
      release_status: requireString(metadata.release_status, "utilization release_status"),
      release_note: requireString(metadata.release_note, "utilization release_note"),
      release_approved: true,
      public_website_release_approved: true,
      disclosure_threshold: requiredCount(metadata.disclosure_threshold, "disclosure_threshold"),
      windows: Array.isArray(metadata.windows) ? metadata.windows.map(String) : [],
      severities,
      window_definitions: metadata.window_definitions as Record<string, string>,
      rate_denominator_definition: requireString(
        metadata.rate_denominator_definition,
        "utilization rate_denominator_definition",
      ),
      los_denominator_definition: requireString(
        metadata.los_denominator_definition,
        "utilization los_denominator_definition",
      ),
      primary_care_specialty_list: primaryCare,
      specialty_care_definition: requireString(
        metadata.specialty_care_definition,
        "utilization specialty_care_definition",
      ),
      ed_inpatient_overlap_warning: requireString(
        metadata.ed_inpatient_overlap_warning,
        "utilization ed_inpatient_overlap_warning",
      ),
    },
    rows,
  };
}

function rowsFromColumns(
  columns: Record<string, unknown[]>,
  metadata: WasPartitionMetadata,
) {
  const length = metadata.row_count || Math.max(
    0,
    ...Object.values(columns).map((values) => values.length),
  );
  return Array.from({ length }, (_, index): WasAssociationRow => {
    const featureId = String(columns.feature_id?.[index] ?? "");
    return {
      feature_key: String(
        columns.feature_key?.[index] ?? `${metadata.analysis_id}:${featureId}`,
      ),
      feature_id: featureId,
      feature_name: String(columns.feature_name?.[index] ?? "Unknown feature"),
      category: String(columns.category?.[index] ?? "Other"),
      subgroup: String(columns.subgroup?.[index] ?? ""),
      effect_type: String(columns.effect_type?.[index] ?? metadata.effect_type),
      effect: toNullableNumber(columns.effect?.[index]),
      se: toNullableNumber(columns.se?.[index]),
      ci_low: toNullableNumber(columns.ci_low?.[index]),
      ci_high: toNullableNumber(columns.ci_high?.[index]),
      p: toNullableNumber(columns.p?.[index]),
      neglog10p: toNullableNumber(columns.neglog10p?.[index]),
      sig_fdr: toBoolean(columns.sig_fdr?.[index]),
      sig_bon: toBoolean(columns.sig_bon?.[index]),
      unstable: toBoolean(columns.unstable?.[index]),
      unstable_reason: columns.unstable_reason?.[index]
        ? String(columns.unstable_reason[index])
        : null,
      n: toNullableNumber(columns.n?.[index]),
      n_secondary: toNullableNumber(columns.n_secondary?.[index]),
      prevalence: toNullableNumber(columns.prevalence?.[index]),
      label_review_required: toBoolean(columns.label_review_required?.[index]),
      referral_item: toBoolean(columns.referral_item?.[index]),
    };
  });
}

export async function fetchWasPartition(
  partition: WasPartitionRef,
): Promise<WasPartitionPayload> {
  const response = await fetch(safeDataUrl(partition.path));
  if (!response.ok) {
    throw new Error(`Association data are unavailable (${response.status}).`);
  }
  const payload = await response.json() as RawPartitionPayload;
  if (!payload.columns || typeof payload.columns !== "object") {
    throw new Error("Association data have an invalid shape.");
  }
  const metadata = normalizePartitionRef({
    ...partition,
    metadata: payload.metadata,
    path: partition.path,
  });
  if (metadata.analysis_id !== partition.analysis_id) {
    throw new Error("Partition metadata do not match the manifest.");
  }
  return { metadata, rows: rowsFromColumns(payload.columns, metadata) };
}

function partitionScore(partition: WasPartitionRef, state: WasState) {
  let score = 0;
  if (partition.window === state.window) score += 100;
  if (partition.model.toUpperCase() === state.model.toUpperCase()) score += 100;
  if (partition.contrast === state.contrast) score += 100;
  if (partition.model.toUpperCase() === "M4") score += 8;
  if (partition.contrast === "severe_vs_none") score += 4;
  if (partition.window === "1yr") score += 2;
  if (partition.window === "all") score += 1;
  return score;
}

export function selectWasPartition(manifest: WasManifest, state: WasState) {
  return manifest.partitions
    .filter((partition) => partition.analysis_id === state.analysis)
    .sort((a, b) => partitionScore(b, state) - partitionScore(a, state))[0];
}

export function formatWasEffectType(effectType: string) {
  const normalized = effectType.trim().toLowerCase();
  if (normalized === "beta" || normalized === "β") return "β";
  if (normalized === "or") return "OR";
  if (normalized === "hr") return "HR";
  if (normalized === "irr") return "IRR";
  return effectType;
}

export function isRatioPartition(metadata: WasPartitionMetadata) {
  return metadata.effect_scale.toLowerCase() === "ratio" ||
    metadata.neutral_value === 1 ||
    ["or", "hr", "irr"].includes(metadata.effect_type.toLowerCase());
}
