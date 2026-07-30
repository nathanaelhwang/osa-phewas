import type { Analysis, Model } from "./atlas-state";
import type { WasAnalysisId, WasFamily } from "./was-config";

export type AssociationRow = {
  feature_id: string;
  feature_name: string;
  category: string;
  effect_type: string;
  effect: number | null;
  ci_low: number | null;
  ci_high: number | null;
  p: number | null;
  neglog10p: number | null;
  sig_fdr: boolean;
  sig_bon: boolean;
  unstable: boolean;
  unstable_reason?: string | null;
  n_atrisk?: number | null;
  n_events?: number | null;
  ph_p?: number | null;
};

export type FeatureRecord = {
  feature_id: string;
  feature_name: string;
  category: string;
  prevalence: boolean;
  incidence: boolean;
  alternate_names?: string[];
};

export type WasFeatureRecord = {
  feature_key: string;
  feature_id: string;
  feature_name: string;
  family: WasFamily;
  analysis_ids: WasAnalysisId[];
  category: string;
  subgroup: string;
  code_system: string;
  alternate_names: string[];
  windows: string[];
  label_review_required: boolean;
};

export type SearchFeatureRecord = {
  source: "phedas" | "was";
  feature_key: string;
  feature_id: string;
  feature_name: string;
  family: "phedas" | WasFamily;
  analysis_ids: string[];
  category: string;
  subgroup: string;
  code_system: string;
  alternate_names: string[];
  windows: string[];
  label_review_required: boolean;
};

export type WasDetailPartitionMetadata = {
  analysis_id: WasAnalysisId;
  family: WasFamily;
  label: string;
  window: string;
  model: string;
  contrast: string;
  effect_type: string;
  effect_scale: string;
  neutral_value: number;
  directional: boolean;
  code_system: string;
  row_count: number;
  release_status: string;
  release_note: string;
  sample_n_label: string;
  secondary_n_label: string;
  qc_warnings: string[];
};

export type WasDetailPartitionRef = WasDetailPartitionMetadata & { path: string };

export type WasDetailManifest = {
  analyses: Array<{ analysis_id: WasAnalysisId; family?: WasFamily; label?: string }>;
  partitions: WasDetailPartitionRef[];
};

export type WasDetailAssociationRow = {
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
  referral_item: boolean;
};

export type WasDetailPartition = {
  metadata: WasDetailPartitionMetadata;
  rows: WasDetailAssociationRow[];
};

type ColumnarPayload = {
  meta?: Record<string, unknown>;
  columns?: Record<string, unknown[]>;
  rows?: AssociationRow[];
  features?: FeatureRecord[];
  [key: string]: unknown;
};

type WasFeaturePayload = {
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

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value === null || value === undefined || value === "" ? [] : [String(value)];
}

function toWarningArray(...values: unknown[]) {
  return values.flatMap(toStringArray).filter(Boolean);
}

function rowsFromColumns(columns: Record<string, unknown[]>): AssociationRow[] {
  const length = Math.max(0, ...Object.values(columns).map((values) => values.length));
  return Array.from({ length }, (_, index) => ({
    feature_id: String(columns.feature_id?.[index] ?? ""),
    feature_name: String(columns.feature_name?.[index] ?? "Unknown feature"),
    category: String(columns.category?.[index] ?? "other"),
    effect_type: String(columns.effect_type?.[index] ?? "effect"),
    effect: toNullableNumber(columns.effect?.[index]),
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
    n_atrisk: toNullableNumber(columns.n_atrisk?.[index]),
    n_events: toNullableNumber(columns.n_events?.[index]),
    ph_p: toNullableNumber(columns.ph_p?.[index]),
  }));
}

export async function fetchPartition(
  analysis: Analysis,
  model: Model,
  contrast: string,
) {
  const response = await fetch(
    `/data/phedas/${analysis}/${model.toLowerCase()}/${contrast}.json`,
  );
  if (!response.ok) {
    throw new Error(`Association data are unavailable (${response.status}).`);
  }
  const payload = (await response.json()) as ColumnarPayload;
  if (payload.rows) return payload.rows;
  if (payload.columns) return rowsFromColumns(payload.columns);
  return rowsFromColumns(payload as unknown as Record<string, unknown[]>);
}

function featureRowsFromColumns(columns: Record<string, unknown[]>): FeatureRecord[] {
  const length = columns.feature_id?.length ?? 0;
  return Array.from({ length }, (_, index) => ({
    feature_id: String(columns.feature_id?.[index] ?? ""),
    feature_name: String(columns.feature_name?.[index] ?? "Unknown feature"),
    category: String(columns.category?.[index] ?? "other"),
    prevalence: toBoolean(columns.prevalence?.[index]),
    incidence: toBoolean(columns.incidence?.[index]),
    alternate_names: Array.isArray(columns.alternate_names?.[index])
      ? (columns.alternate_names[index] as unknown[]).map(String)
      : [],
  }));
}

export async function fetchFeatures() {
  const response = await fetch("/data/features.json");
  if (!response.ok) throw new Error("Feature index is unavailable.");
  const payload = (await response.json()) as ColumnarPayload;
  if (payload.features) return payload.features;
  if (payload.columns) return featureRowsFromColumns(payload.columns);
  return featureRowsFromColumns(payload as unknown as Record<string, unknown[]>);
}

function wasFeatureRowsFromColumns(columns: Record<string, unknown[]>): WasFeatureRecord[] {
  const length = columns.feature_key?.length ?? 0;
  return Array.from({ length }, (_, index) => ({
    feature_key: String(columns.feature_key?.[index] ?? ""),
    feature_id: String(columns.feature_id?.[index] ?? ""),
    feature_name: String(columns.feature_name?.[index] ?? "Unknown feature"),
    family: String(columns.family?.[index] ?? "") as WasFamily,
    analysis_ids: toStringArray(columns.analysis_ids?.[index]) as WasAnalysisId[],
    category: String(columns.category?.[index] ?? "Other"),
    subgroup: String(columns.subgroup?.[index] ?? ""),
    code_system: String(columns.code_system?.[index] ?? "Feature"),
    alternate_names: toStringArray(columns.alternate_names?.[index]),
    windows: toStringArray(columns.windows?.[index]),
    label_review_required: toBoolean(columns.label_review_required?.[index]),
  }));
}

export async function fetchWasFeatures() {
  const response = await fetch("/data/was-features.json");
  if (!response.ok) throw new Error("Cross-domain feature index is unavailable.");
  const payload = (await response.json()) as WasFeaturePayload;
  if (!payload.columns) throw new Error("Cross-domain feature index has an invalid shape.");
  return wasFeatureRowsFromColumns(payload.columns);
}

export async function fetchSearchFeatures(): Promise<SearchFeatureRecord[]> {
  const [diseaseResult, wasResult] = await Promise.allSettled([
    fetchFeatures(),
    fetchWasFeatures(),
  ]);
  if (diseaseResult.status === "rejected" && wasResult.status === "rejected") {
    throw new Error("Feature indexes are unavailable.");
  }
  const disease = diseaseResult.status === "fulfilled" ? diseaseResult.value : [];
  const was = wasResult.status === "fulfilled" ? wasResult.value : [];
  return [
    ...disease.map((feature): SearchFeatureRecord => ({
      source: "phedas",
      feature_key: `phedas:${feature.feature_id}`,
      feature_id: feature.feature_id,
      feature_name: feature.feature_name,
      family: "phedas",
      analysis_ids: [
        ...(feature.prevalence ? ["prevalence"] : []),
        ...(feature.incidence ? ["incidence"] : []),
      ],
      category: feature.category,
      subgroup: "",
      code_system: "PheCode",
      alternate_names: feature.alternate_names ?? [],
      windows: [],
      label_review_required: false,
    })),
    ...was.map((feature): SearchFeatureRecord => ({
      source: "was",
      ...feature,
    })),
  ];
}

function normalizeWasPartitionRef(raw: Record<string, unknown>): WasDetailPartitionRef {
  const nested = raw.metadata && typeof raw.metadata === "object"
    ? raw.metadata as Record<string, unknown>
    : {};
  const metadata = { ...raw, ...nested };
  const required = (field: string) => {
    const value = metadata[field];
    if (typeof value !== "string" || !value) {
      throw new Error(`WAS manifest is missing ${field}.`);
    }
    return value;
  };
  const path = raw.path;
  if (typeof path !== "string" || !path) {
    throw new Error("WAS manifest is missing a partition path.");
  }
  const neutral = Number(metadata.neutral_value);
  const rowCount = Number(metadata.row_count);
  return {
    path,
    analysis_id: required("analysis_id") as WasAnalysisId,
    family: required("family") as WasFamily,
    label: required("label"),
    window: required("window"),
    model: required("model").toUpperCase(),
    contrast: required("contrast"),
    effect_type: required("effect_type"),
    effect_scale: required("effect_scale"),
    neutral_value: Number.isFinite(neutral) ? neutral : 0,
    directional: toBoolean(metadata.directional),
    code_system: required("code_system"),
    row_count: Number.isFinite(rowCount) ? rowCount : 0,
    release_status: typeof metadata.release_status === "string"
      ? metadata.release_status
      : "research_review",
    release_note: typeof metadata.release_note === "string" ? metadata.release_note : "",
    sample_n_label: typeof metadata.sample_n_label === "string"
      ? metadata.sample_n_label
      : "Analytic N",
    secondary_n_label: typeof metadata.secondary_n_label === "string"
      ? metadata.secondary_n_label
      : "Feature-positive N",
    qc_warnings: toWarningArray(metadata.qc_warnings, metadata.warnings),
  };
}

export async function fetchWasDetailManifest(): Promise<WasDetailManifest> {
  const response = await fetch("/data/was-manifest.json");
  if (!response.ok) throw new Error(`WAS manifest is unavailable (${response.status}).`);
  const raw = await response.json() as {
    analyses?: unknown[];
    partitions?: Array<Record<string, unknown>>;
  };
  if (!Array.isArray(raw.analyses) || !Array.isArray(raw.partitions)) {
    throw new Error("WAS manifest has an invalid shape.");
  }
  const analyses = raw.analyses.map((entry) => {
    const item = typeof entry === "string"
      ? { analysis_id: entry }
      : entry as Record<string, unknown>;
    const analysisId = item.analysis_id ?? item.id;
    if (typeof analysisId !== "string" || !analysisId) {
      throw new Error("WAS manifest contains an invalid analysis entry.");
    }
    return {
      analysis_id: analysisId as WasAnalysisId,
      ...(typeof item.family === "string" ? { family: item.family as WasFamily } : {}),
      ...(typeof item.label === "string" ? { label: item.label } : {}),
    };
  });
  return { analyses, partitions: raw.partitions.map(normalizeWasPartitionRef) };
}

function safeWasDataUrl(path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+/, "");
  if (normalized.includes("..") || /^[a-z]+:/i.test(normalized)) {
    throw new Error("WAS manifest contains an unsafe partition path.");
  }
  return normalized.startsWith("data/") ? `/${normalized}` : `/data/${normalized}`;
}

function wasDetailRowsFromColumns(columns: Record<string, unknown[]>): WasDetailAssociationRow[] {
  const length = Math.max(0, ...Object.values(columns).map((values) => values.length));
  return Array.from({ length }, (_, index) => ({
    feature_key: String(columns.feature_key?.[index] ?? ""),
    feature_id: String(columns.feature_id?.[index] ?? ""),
    feature_name: String(columns.feature_name?.[index] ?? "Unknown feature"),
    category: String(columns.category?.[index] ?? "Other"),
    subgroup: String(columns.subgroup?.[index] ?? ""),
    effect_type: String(columns.effect_type?.[index] ?? "Effect"),
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
    referral_item: toBoolean(columns.referral_item?.[index]),
  }));
}

export async function fetchWasDetailPartition(
  partition: WasDetailPartitionRef,
): Promise<WasDetailPartition> {
  const response = await fetch(safeWasDataUrl(partition.path));
  if (!response.ok) throw new Error(`Association data are unavailable (${response.status}).`);
  const raw = await response.json() as {
    metadata?: Record<string, unknown>;
    columns?: Record<string, unknown[]>;
  };
  if (!raw.columns || typeof raw.columns !== "object") {
    throw new Error("Association data have an invalid shape.");
  }
  const metadata = normalizeWasPartitionRef({
    ...partition,
    metadata: raw.metadata ?? {},
    path: partition.path,
  });
  if (metadata.analysis_id !== partition.analysis_id) {
    throw new Error("Partition metadata do not match the manifest.");
  }
  return { metadata, rows: wasDetailRowsFromColumns(raw.columns) };
}

export function formatP(value: number | null | undefined) {
  if (value === null || value === undefined) return "Not available";
  if (value === 0) return "<1 × 10⁻³⁰⁰";
  if (value < 0.001) return value.toExponential(2).replace("e", " × 10^");
  return value.toPrecision(3);
}

export function formatEffect(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return value.toFixed(value >= 10 ? 1 : 2);
}

export function featureMatches(feature: FeatureRecord, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    feature.feature_id.toLowerCase().includes(needle) ||
    feature.feature_name.toLowerCase().includes(needle) ||
    feature.category.toLowerCase().includes(needle) ||
    feature.alternate_names?.some((name) => name.toLowerCase().includes(needle))
  );
}

export function searchFeatureMatches(feature: SearchFeatureRecord, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    feature.feature_key,
    feature.feature_id,
    feature.feature_name,
    feature.family,
    feature.category,
    feature.subgroup,
    feature.code_system,
    ...feature.alternate_names,
  ].some((value) => value.toLowerCase().includes(needle));
}
