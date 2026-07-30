export type SurvivalManifestFeature = {
  feature_id: string;
  feature_name: string;
  category: string;
  path: string;
  available_views: { severity: boolean; cpap: boolean };
  osa_control: boolean;
};

export type SurvivalManifest = {
  schema_version: number;
  exporter_version: string;
  release: Record<string, unknown>;
  defaults: {
    feature_id: string;
    view: "severity" | "cpap";
    feature_path: string;
    window_days: 90 | 180;
  };
  analysis: Record<string, unknown>;
  strata: {
    severity_group_order: string[];
    cpap_window_order: Array<90 | 180>;
    cpap_group_order: string[];
  };
  disclosure: {
    counts_disclosure_status: string;
    risk_table_available: boolean;
    downloads_enabled: boolean;
    public_release_allowed: boolean;
  };
  features: SurvivalManifestFeature[];
  counts: Record<string, number>;
};

export type SurvivalFeaturePayload = {
  schema_version: number;
  metadata: {
    feature_id: string;
    feature_name: string;
    category: string;
    severe_hr: number | null;
    sig_contrasts: string[];
    osa_control: boolean;
    available_views: { severity: boolean; cpap: boolean };
    selection_basis: string;
    selection_model: string;
    estimand: string;
    estimator: string;
    competing_event: string;
    event_definition: string;
    time_origin: string;
    time_unit: string;
    follow_up_end: string;
    curve_inclusion: Record<string, unknown>;
    table_time_years: number[];
    cpap_table_time_years: number[];
    cpap_default_window_days: 90 | 180;
    cpap_time_origin: string;
    cpap_interpretation: string;
    release_status: string;
    release_note: string;
    counts_disclosure_status: string;
    risk_table_available: boolean;
    downloads_enabled: boolean;
  };
  strata: {
    severity_group_order: string[];
    cpap_window_order: Array<90 | 180>;
    cpap_group_order: string[];
    [key: string]: unknown;
  };
  severity: {
    row_count: number;
    columns: {
      group: string[];
      time_years: number[];
      cif_pct: number[];
    };
  };
  cpap: {
    row_count: number;
    omitted_strata: Array<{ window_days: 90 | 180; group: string; reason: string }>;
    columns: {
      window_days: Array<90 | 180>;
      group: string[];
      time_years: number[];
      cif_pct: number[];
    };
  };
};

function safeDataUrl(path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /^[a-z]+:/i.test(normalized)) {
    throw new Error("Survival manifest contains an unsafe feature path.");
  }
  return normalized.startsWith("data/") ? `/${normalized}` : `/data/${normalized}`;
}

function assertAlignedColumns(
  label: string,
  rowCount: number,
  columns: Record<string, unknown[]>,
) {
  if (!Number.isInteger(rowCount) || rowCount < 0) {
    throw new Error(`${label} has an invalid row count.`);
  }
  for (const [name, values] of Object.entries(columns)) {
    if (!Array.isArray(values) || values.length !== rowCount) {
      throw new Error(`${label} column ${name} is not aligned.`);
    }
  }
}

export async function fetchSurvivalManifest(): Promise<SurvivalManifest> {
  const response = await fetch("/data/survival-manifest.json");
  if (!response.ok) throw new Error(`Curve index is unavailable (${response.status}).`);
  const payload = await response.json() as SurvivalManifest;
  if (
    payload.schema_version !== 2 ||
    !Array.isArray(payload.features) ||
    !payload.defaults?.feature_id ||
    !payload.strata ||
    !payload.disclosure
  ) {
    throw new Error("Curve index has an invalid shape.");
  }
  if (new Set(payload.features.map((feature) => feature.feature_id)).size !== payload.features.length) {
    throw new Error("Curve index contains duplicate features.");
  }
  return payload;
}

export async function fetchSurvivalFeature(
  feature: SurvivalManifestFeature,
): Promise<SurvivalFeaturePayload> {
  const response = await fetch(safeDataUrl(feature.path));
  if (!response.ok) throw new Error(`Curve data are unavailable (${response.status}).`);
  const payload = await response.json() as SurvivalFeaturePayload;
  if (payload.schema_version !== 2 || payload.metadata?.feature_id !== feature.feature_id) {
    throw new Error("Curve data do not match the selected feature.");
  }
  assertAlignedColumns(
    "Severity curves",
    payload.severity.row_count,
    payload.severity.columns,
  );
  assertAlignedColumns("Landmark CPAP curves", payload.cpap.row_count, payload.cpap.columns);
  return payload;
}
