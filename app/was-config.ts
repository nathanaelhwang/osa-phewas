export const WAS_FAMILIES = [
  "labwas",
  "medwas",
  "behwas",
  "procwas",
  "utilwas",
] as const;

export const WAS_ANALYSIS_IDS = [
  "labwas_mean",
  "labwas_median",
  "labwas_order_rate",
  "labwas_order_propensity",
  "medwas_fill",
  "behwas_binary",
  "behwas_continuous",
  "procwas_rate",
  "utilwas_presence",
  "utilwas_count_present",
  "utilwas_specialty_rate",
] as const;

export const WAS_VIEWS = ["manhattan", "volcano", "forest", "table"] as const;
export const WAS_SIGNIFICANCE = ["all", "fdr", "bonferroni"] as const;

export type WasFamily = (typeof WAS_FAMILIES)[number];
export type WasAnalysisId = (typeof WAS_ANALYSIS_IDS)[number];
export type WasView = (typeof WAS_VIEWS)[number];
export type WasSignificance = (typeof WAS_SIGNIFICANCE)[number];

export type WasAnalysisConfig = {
  id: WasAnalysisId;
  family: WasFamily;
  label: string;
  shortLabel: string;
  question: string;
  defaultWindow: string;
  defaultView: WasView;
  codeLabel: string;
};

export const WAS_FAMILY_LABELS: Record<WasFamily, string> = {
  labwas: "LabWAS",
  medwas: "MedWAS",
  behwas: "BehWAS",
  procwas: "ProcWAS",
  utilwas: "UtilWAS",
};

export const WAS_FAMILY_DESCRIPTIONS: Record<WasFamily, string> = {
  labwas: "Laboratory values and ordering patterns around the sleep-study index.",
  medwas: "Medication-fill associations within the defined observation window.",
  behwas: "Preliminary EHR-derived behavioral features, separated by outcome type.",
  procwas: "Procedure-rate associations within the defined observation window.",
  utilwas: "Healthcare-use presence, counts, and specialty rates as distinct estimands.",
};

export const WAS_ANALYSES: Record<WasAnalysisId, WasAnalysisConfig> = {
  labwas_mean: {
    id: "labwas_mean",
    family: "labwas",
    label: "LabWAS · mean observed value",
    shortLabel: "Mean value",
    question: "How do mean observed laboratory values differ with OSA severity?",
    defaultWindow: "1yr",
    defaultView: "manhattan",
    codeLabel: "Laboratory feature",
  },
  labwas_median: {
    id: "labwas_median",
    family: "labwas",
    label: "LabWAS · median observed value",
    shortLabel: "Median value",
    question: "How do median observed laboratory values differ with OSA severity?",
    defaultWindow: "1yr",
    defaultView: "manhattan",
    codeLabel: "Laboratory feature",
  },
  labwas_order_rate: {
    id: "labwas_order_rate",
    family: "labwas",
    label: "LabWAS · ordering rate",
    shortLabel: "Ordering rate",
    question: "How do laboratory ordering rates differ with OSA severity?",
    defaultWindow: "1yr",
    defaultView: "manhattan",
    codeLabel: "Laboratory feature",
  },
  labwas_order_propensity: {
    id: "labwas_order_propensity",
    family: "labwas",
    label: "LabWAS · ordering propensity",
    shortLabel: "Ordering propensity",
    question: "How does the probability of a laboratory order differ with OSA severity?",
    defaultWindow: "1yr",
    defaultView: "manhattan",
    codeLabel: "Laboratory feature",
  },
  medwas_fill: {
    id: "medwas_fill",
    family: "medwas",
    label: "MedWAS · medication fill",
    shortLabel: "Medication fills",
    question: "Which medication classes are filled at different rates across OSA severity?",
    defaultWindow: "1yr",
    defaultView: "manhattan",
    codeLabel: "Medication feature",
  },
  behwas_binary: {
    id: "behwas_binary",
    family: "behwas",
    label: "BehWAS · binary behavior",
    shortLabel: "Binary behaviors",
    question: "How do binary EHR-derived behaviors differ with OSA severity?",
    defaultWindow: "1yr",
    defaultView: "forest",
    codeLabel: "Behavior feature",
  },
  behwas_continuous: {
    id: "behwas_continuous",
    family: "behwas",
    label: "BehWAS · continuous behavior",
    shortLabel: "Continuous behaviors",
    question: "How do continuous EHR-derived behaviors differ with OSA severity?",
    defaultWindow: "1yr",
    defaultView: "forest",
    codeLabel: "Behavior feature",
  },
  procwas_rate: {
    id: "procwas_rate",
    family: "procwas",
    label: "ProcWAS · procedure rate",
    shortLabel: "Procedure rates",
    question: "How do procedure rates differ with OSA severity?",
    defaultWindow: "1yr",
    defaultView: "manhattan",
    codeLabel: "Procedure feature",
  },
  utilwas_presence: {
    id: "utilwas_presence",
    family: "utilwas",
    label: "UtilWAS · any use",
    shortLabel: "Any utilization",
    question: "How does the presence of healthcare use differ with OSA severity?",
    defaultWindow: "1yr",
    defaultView: "manhattan",
    codeLabel: "Utilization feature",
  },
  utilwas_count_present: {
    id: "utilwas_count_present",
    family: "utilwas",
    label: "UtilWAS · count among users",
    shortLabel: "Count among users",
    question: "Among people with use, how do utilization counts differ with OSA severity?",
    defaultWindow: "1yr",
    defaultView: "manhattan",
    codeLabel: "Utilization feature",
  },
  utilwas_specialty_rate: {
    id: "utilwas_specialty_rate",
    family: "utilwas",
    label: "UtilWAS · specialty rate",
    shortLabel: "Specialty rates",
    question: "How do specialty-specific utilization rates differ with OSA severity?",
    defaultWindow: "1yr",
    defaultView: "manhattan",
    codeLabel: "Specialty feature",
  },
};

export const WAS_FAMILY_DEFAULT_ANALYSIS: Record<WasFamily, WasAnalysisId> = {
  labwas: "labwas_mean",
  medwas: "medwas_fill",
  behwas: "behwas_binary",
  procwas: "procwas_rate",
  utilwas: "utilwas_presence",
};

export function analysesForFamily(family: WasFamily) {
  return WAS_ANALYSIS_IDS.map((id) => WAS_ANALYSES[id]).filter(
    (analysis) => analysis.family === family,
  );
}

export function isWasAnalysisId(value: string | undefined): value is WasAnalysisId {
  return WAS_ANALYSIS_IDS.includes(value as WasAnalysisId);
}

export function isWasFamily(value: string | undefined): value is WasFamily {
  return WAS_FAMILIES.includes(value as WasFamily);
}

export function isDirectionalView(view: WasView) {
  return view === "volcano" || view === "forest";
}
