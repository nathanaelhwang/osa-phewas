#!/usr/bin/env python3
"""Export allowlisted aggregate LabWAS/MedWAS/BehWAS/ProcWAS/UtilWAS results.

The input paths are intentionally fixed to reviewed aggregate CSV artifacts. The
exporter has no option for selecting arbitrary data and refuses schema drift,
identifier-like columns, unsafe paths, duplicate associations, missing labels,
and non-finite values before writing any public files.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
EXPORTER_VERSION = "1.0.0"
DEFAULT_RELEASE = "2026-07-21"
MODELS = ("M1", "M2", "M3", "M4")
CONTRASTS = (
    "omnibus",
    "trend",
    "mild_vs_none",
    "moderate_vs_none",
    "severe_vs_none",
    "ahi_ge5",
    "ahi_ge15",
)
WINDOW_ORDER = {"1yr": 0, "5yr": 1, "lifetime": 2}

WEBSITE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WEBSITE_ROOT.parent
ARCHIVE_ROOT = PROJECT_ROOT / "results" / "archived results"
OUTPUT_ROOT = WEBSITE_ROOT / "public" / "data"

OUTPUT_COLUMNS = (
    "feature_key",
    "feature_id",
    "feature_name",
    "category",
    "subgroup",
    "effect_type",
    "effect",
    "se",
    "ci_low",
    "ci_high",
    "p",
    "neglog10p",
    "sig_fdr",
    "sig_bon",
    "unstable",
    "unstable_reason",
    "n",
    "n_secondary",
    "prevalence",
    "label_review_required",
)
REGISTRY_COLUMNS = (
    "feature_key",
    "feature_id",
    "feature_name",
    "family",
    "analysis_ids",
    "category",
    "subgroup",
    "code_system",
    "alternate_names",
    "windows",
    "label_review_required",
)

ASSOCIATION_COLUMNS = {
    "window",
    "target",
    "code",
    "contrast",
    "model",
    "n",
    "n_filled",
    "effect_type",
    "effect",
    "se",
    "ci_low",
    "ci_high",
    "p",
    "neglog10p",
    "sig_bon",
    "sig_fdr",
    "unstable",
}
LAB_COLUMNS = {
    "window",
    "target",
    "loinc_code",
    "category",
    "contrast",
    "model",
    "n",
    "effect_type",
    "effect",
    "se",
    "ci_low",
    "ci_high",
    "p",
    "neglog10p",
    "sig_bon",
    "sig_fdr",
    "unstable",
}
LAB_PROPENSITY_COLUMNS = LAB_COLUMNS - {"target"} | {"prevalence"}
BEH_COLUMNS = {
    "window",
    "outcome",
    "kind",
    "contrast",
    "model",
    "n",
    "effect_type",
    "effect",
    "se",
    "ci_low",
    "ci_high",
    "p",
    "neglog10p",
    "sig_bon",
    "sig_fdr",
    "unstable",
}
PROC_COLUMNS = {
    "window",
    "feature",
    "procedure_type",
    "body_system",
    "part",
    "contrast",
    "model",
    "n",
    "effect_type",
    "effect",
    "se",
    "ci_low",
    "ci_high",
    "p",
    "neglog10p",
    "sig_bon",
    "sig_fdr",
    "unstable",
}
UTIL_PHECODE_COLUMNS = {
    "window",
    "combo",
    "feature",
    "phenotype",
    "category",
    "part",
    "contrast",
    "model",
    "n",
    "effect_type",
    "effect",
    "se",
    "ci_low",
    "ci_high",
    "p",
    "neglog10p",
    "sig_bon",
    "sig_fdr",
    "unstable",
}
UTIL_SPECIALTY_COLUMNS = {
    "window",
    "family",
    "feature",
    "part",
    "contrast",
    "model",
    "n",
    "effect_type",
    "effect",
    "se",
    "ci_low",
    "ci_high",
    "p",
    "neglog10p",
    "sig_bon",
    "sig_fdr",
    "unstable",
}

SOURCE_FILES = {
    "lab_results_1yr": (
        ARCHIVE_ROOT / "labwas_results" / "analysis" / "results_1yr.csv",
        LAB_COLUMNS,
    ),
    "lab_results_5yr": (
        ARCHIVE_ROOT / "labwas_results" / "analysis" / "results_5yr.csv",
        LAB_COLUMNS,
    ),
    "lab_propensity_1yr": (
        ARCHIVE_ROOT
        / "labwas_results"
        / "analysis"
        / "results_propensity_1yr.csv",
        LAB_PROPENSITY_COLUMNS,
    ),
    "lab_propensity_5yr": (
        ARCHIVE_ROOT
        / "labwas_results"
        / "analysis"
        / "results_propensity_5yr.csv",
        LAB_PROPENSITY_COLUMNS,
    ),
    "lab_labels": (
        ARCHIVE_ROOT / "labwas_results" / "loinc_category.csv",
        {"loinc_code", "loinc_long_common_name", "CLASS", "SYSTEM", "category"},
    ),
    "lab_counts": (
        ARCHIVE_ROOT / "labwas_results" / "lab_prevalence_missingness.csv",
        {
            "loinc_code",
            "loinc_long_common_name",
            "category",
            "n_5yr",
            "prevalence_5yr",
            "missingness_5yr",
            "in_analysis_5yr",
            "n_1yr",
            "prevalence_1yr",
            "missingness_1yr",
            "in_analysis_1yr",
            "prev_None_5yr",
            "prev_Mild_5yr",
            "prev_Moderate_5yr",
            "prev_Severe_5yr",
        },
    ),
    "med_results_1yr": (
        ARCHIVE_ROOT / "medwas_results" / "analysis" / "results_1yr.csv",
        ASSOCIATION_COLUMNS,
    ),
    "med_results_5yr": (
        ARCHIVE_ROOT / "medwas_results" / "analysis" / "results_5yr.csv",
        ASSOCIATION_COLUMNS,
    ),
    "med_labels": (
        ARCHIVE_ROOT / "medwas_results" / "gpi_category.csv",
        {
            "code",
            "drug_class_name",
            "gpi2",
            "drug_group_name",
            "category",
            "label_source",
            "needs_review",
        },
    ),
    "beh_results": (
        ARCHIVE_ROOT / "behwas_results" / "analysis" / "results_all.csv",
        BEH_COLUMNS,
    ),
    "proc_results_1yr": (
        ARCHIVE_ROOT / "procwas_results" / "analysis" / "results_1yr.csv",
        PROC_COLUMNS,
    ),
    "proc_results_5yr": (
        ARCHIVE_ROOT / "procwas_results" / "analysis" / "results_5yr.csv",
        PROC_COLUMNS,
    ),
    "proc_counts_1yr": (
        ARCHIVE_ROOT
        / "procwas_results"
        / "analysis"
        / "kept_descriptors_1yr.csv",
        {"clear_descriptor", "procedure_type", "body_system", "n_pat", "n_orders"},
    ),
    "proc_counts_5yr": (
        ARCHIVE_ROOT
        / "procwas_results"
        / "analysis"
        / "kept_descriptors_5yr.csv",
        {"clear_descriptor", "procedure_type", "body_system", "n_pat", "n_orders"},
    ),
    "util_phecode_results_1yr": (
        ARCHIVE_ROOT / "utilwas_results" / "analysis" / "results_phecode_1yr.csv",
        UTIL_PHECODE_COLUMNS,
    ),
    "util_phecode_results_5yr": (
        ARCHIVE_ROOT / "utilwas_results" / "analysis" / "results_phecode_5yr.csv",
        UTIL_PHECODE_COLUMNS,
    ),
    "util_phecode_counts_1yr": (
        ARCHIVE_ROOT / "utilwas_results" / "analysis" / "kept_phecodes_1yr.csv",
        {"combo", "phecode", "phenotype", "category", "n_pat"},
    ),
    "util_phecode_counts_5yr": (
        ARCHIVE_ROOT / "utilwas_results" / "analysis" / "kept_phecodes_5yr.csv",
        {"combo", "phecode", "phenotype", "category", "n_pat"},
    ),
    "util_specialty_results_1yr": (
        ARCHIVE_ROOT / "utilwas_results" / "analysis" / "results_specialty_1yr.csv",
        UTIL_SPECIALTY_COLUMNS,
    ),
    "util_specialty_results_5yr": (
        ARCHIVE_ROOT / "utilwas_results" / "analysis" / "results_specialty_5yr.csv",
        UTIL_SPECIALTY_COLUMNS,
    ),
    "util_specialty_counts_1yr": (
        ARCHIVE_ROOT
        / "utilwas_results"
        / "analysis"
        / "kept_specialties_1yr.csv",
        {"family", "dept_specialty", "n_pat"},
    ),
    "util_specialty_counts_5yr": (
        ARCHIVE_ROOT
        / "utilwas_results"
        / "analysis"
        / "kept_specialties_5yr.csv",
        {"family", "dept_specialty", "n_pat"},
    ),
}

BEHAVIOR_LABELS = {
    "adherence_pdc": (
        "Medication adherence (proportion of days covered)",
        "Medication adherence",
        "continuous",
    ),
    "adherent": ("Medication adherence indicator", "Medication adherence", "binary"),
    "flu_received": ("Influenza vaccination received", "Preventive care", "binary"),
    "flu_count": ("Influenza vaccination count", "Preventive care", "continuous"),
    "fmla_filed": ("FMLA leave filed", "Leave and work absence", "binary"),
    "fmla_dur_days": ("FMLA duration (days)", "Leave and work absence", "continuous"),
    "fmla_admitted": (
        "FMLA admission indicator",
        "Leave and work absence",
        "binary",
    ),
    "fmla_pregnancy": (
        "Pregnancy-related FMLA",
        "Leave and work absence",
        "binary",
    ),
    "any_noshow": ("Any missed appointment", "Appointment attendance", "binary"),
    "no_show_pct": (
        "Missed appointment proportion",
        "Appointment attendance",
        "continuous",
    ),
    "any_off_work": ("Any off-work order", "Work status", "binary"),
    "off_work_days": ("Off-work days", "Work status", "continuous"),
}

UTIL_SUBGROUPS = {
    "physician_primary": "Physician visit · primary diagnosis",
    "ED_primary": "Emergency department · primary diagnosis",
    "ED_secondary": "Emergency department · secondary diagnosis",
    "inpatient_primary": "Inpatient · principal diagnosis",
    "inpatient_secondary": "Inpatient · secondary diagnosis",
    "urgent_primary": "Urgent care · primary diagnosis",
    "urgent_secondary": "Urgent care · secondary diagnosis",
}
SPECIALTY_SUBGROUPS = {
    "physician_level": "Physician-level care",
    "allied_health": "Allied health",
}

BLOCKED_HEADER_TOKENS = {
    "patient",
    "person",
    "subject",
    "participant",
    "member",
    "encounter",
    "visit",
    "mrn",
    "ssn",
    "dob",
    "email",
    "phone",
    "address",
    "identifier",
}
BLOCKED_PATH_PARTS = {
    "data/raw",
    "phi",
    "patient_records",
    "clustering/data",
    ".ssh",
    ".aws",
}


class ExportValidationError(RuntimeError):
    pass


@dataclass(frozen=True)
class AnalysisSpec:
    analysis_id: str
    family: str
    label: str
    primary_effect: str
    omnibus_effect: str
    code_system: str
    release_status: str
    release_note: str
    sample_n_label: str
    secondary_n_label: str | None


LAB_RELEASE_NOTE = (
    "Archived aggregate snapshot. Laboratory value analyses condition on being "
    "tested; ordering analyses also reflect healthcare utilization. Counts are "
    "overall feature counts, not exposure-by-outcome disclosure cells."
)
MED_RELEASE_NOTE = (
    "Archived L1-logistic aggregate snapshot. Some medication class labels are "
    "provisional, and counts are overall fill counts rather than disclosure cross-tabs."
)
BEH_RELEASE_NOTE = (
    "Preliminary archived aggregate results. Source availability, window definitions, "
    "and behavior ascertainment vary by outcome; interpret comparisons cautiously."
)
PROC_RELEASE_NOTE = (
    "Archived aggregate snapshot. Procedure descriptors are EHR-derived, and companion "
    "counts are overall feature counts rather than disclosure cross-tabs."
)
UTIL_RELEASE_NOTE = (
    "Archived results pending analytic and disclosure review. Associations reflect "
    "care-seeking, access, and documentation patterns as well as health status."
)

ANALYSES = {
    "labwas_mean": AnalysisSpec(
        "labwas_mean",
        "labwas",
        "Mean laboratory value",
        "beta",
        "wald_F",
        "LOINC",
        "archived_snapshot",
        LAB_RELEASE_NOTE,
        "Patients with this analyte measured in the model",
        "Patients with at least one measurement in the window",
    ),
    "labwas_median": AnalysisSpec(
        "labwas_median",
        "labwas",
        "Median laboratory value",
        "beta",
        "wald_F",
        "LOINC",
        "archived_snapshot",
        LAB_RELEASE_NOTE,
        "Patients with this analyte measured in the model",
        "Patients with at least one measurement in the window",
    ),
    "labwas_order_rate": AnalysisSpec(
        "labwas_order_rate",
        "labwas",
        "Laboratory order rate among tested patients",
        "IRR",
        "wald_chi2",
        "LOINC",
        "archived_snapshot",
        LAB_RELEASE_NOTE,
        "Tested patients included in the order-rate model",
        "Patients with at least one measurement in the window",
    ),
    "labwas_order_propensity": AnalysisSpec(
        "labwas_order_propensity",
        "labwas",
        "Laboratory ordering propensity",
        "OR",
        "wald_chi2",
        "LOINC",
        "archived_snapshot",
        LAB_RELEASE_NOTE,
        "Patients included in the ordering-propensity model",
        "Patients with at least one measurement in the window",
    ),
    "medwas_fill": AnalysisSpec(
        "medwas_fill",
        "medwas",
        "Medication class fill",
        "OR",
        "wald_chi2",
        "GPI-4",
        "archived_snapshot",
        MED_RELEASE_NOTE,
        "Patients included in the medication-fill model",
        "Patients with at least one fill in the class",
    ),
    "behwas_binary": AnalysisSpec(
        "behwas_binary",
        "behwas",
        "Binary EHR-derived behavior",
        "OR",
        "wald_chi2",
        "EHR behavior",
        "preliminary_archived",
        BEH_RELEASE_NOTE,
        "Patients included in the outcome-specific model",
        None,
    ),
    "behwas_continuous": AnalysisSpec(
        "behwas_continuous",
        "behwas",
        "Continuous EHR-derived behavior",
        "beta",
        "wald_F",
        "EHR behavior",
        "preliminary_archived",
        BEH_RELEASE_NOTE,
        "Patients included in the outcome-specific model",
        None,
    ),
    "procwas_rate": AnalysisSpec(
        "procwas_rate",
        "procwas",
        "Procedure order rate",
        "IRR",
        "wald_chi2",
        "EHR procedure descriptor",
        "archived_snapshot",
        PROC_RELEASE_NOTE,
        "Patients included in the procedure-rate model",
        "Patients with at least one procedure",
    ),
    "utilwas_presence": AnalysisSpec(
        "utilwas_presence",
        "utilwas",
        "Diagnosis presence by care setting",
        "OR",
        "wald_chi2",
        "PheCode",
        "archived_review",
        UTIL_RELEASE_NOTE,
        "Patients included in the diagnosis-presence model",
        "Patients with the diagnosis in this care setting",
    ),
    "utilwas_count_present": AnalysisSpec(
        "utilwas_count_present",
        "utilwas",
        "Diagnosis count among patients with the diagnosis",
        "IRR",
        "wald_chi2",
        "PheCode",
        "archived_review",
        UTIL_RELEASE_NOTE,
        "Patients with the diagnosis included in the count model",
        "Patients with the diagnosis in this care setting",
    ),
    "utilwas_specialty_rate": AnalysisSpec(
        "utilwas_specialty_rate",
        "utilwas",
        "Healthcare specialty visit rate",
        "IRR",
        "wald_chi2",
        "EHR specialty",
        "archived_review",
        UTIL_RELEASE_NOTE,
        "Patients included in the specialty-rate model",
        "Patients with at least one visit to the specialty",
    ),
}
ANALYSIS_RANK = {analysis_id: index for index, analysis_id in enumerate(ANALYSES)}


@dataclass(frozen=True)
class Feature:
    feature_key: str
    feature_id: str
    feature_name: str
    category: str
    subgroup: str | None
    code_system: str
    label_review_required: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-id", default=DEFAULT_RELEASE)
    return parser.parse_args()


def validate_release(release_id: str) -> None:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", release_id):
        raise ExportValidationError("invalid release ID")


def header_tokens(header: str) -> set[str]:
    normalized = re.sub(r"[^a-z0-9]+", "_", header.casefold()).strip("_")
    return set(normalized.split("_"))


def validate_header(source_id: str, expected: set[str], fields: list[str] | None) -> None:
    if fields is None or len(fields) != len(set(fields)):
        raise ExportValidationError(f"{source_id}: missing or duplicate CSV header")
    blocked = sorted(
        field for field in fields if header_tokens(field) & BLOCKED_HEADER_TOKENS
    )
    if blocked:
        raise ExportValidationError(
            f"{source_id}: identifier-like columns are forbidden: {blocked}"
        )
    actual = set(fields)
    if actual != expected:
        raise ExportValidationError(
            f"{source_id}: schema mismatch; "
            f"missing={sorted(expected - actual)}, unexpected={sorted(actual - expected)}"
        )


def validate_source_path(source_id: str, path: Path) -> Path:
    if path.name.casefold().startswith(".env") or path.suffix.casefold() in {".pem", ".key"}:
        raise ExportValidationError(f"{source_id}: unsafe source type")
    resolved = path.resolve(strict=True)
    try:
        relative = resolved.relative_to(ARCHIVE_ROOT.resolve(strict=True))
    except ValueError as exc:
        raise ExportValidationError(f"{source_id}: source escapes aggregate archive") from exc
    normalized = relative.as_posix().casefold()
    if any(part in normalized for part in BLOCKED_PATH_PARTS) or "_identified" in normalized:
        raise ExportValidationError(f"{source_id}: unsafe source path")
    if resolved.suffix.casefold() != ".csv":
        raise ExportValidationError(f"{source_id}: only aggregate CSV sources are allowed")
    return resolved


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class SourceCache:
    def __init__(self) -> None:
        self.rows: dict[str, list[dict[str, str | None]]] = {}
        self.metadata: dict[str, dict[str, Any]] = {}

    def read(self, source_id: str) -> list[dict[str, str | None]]:
        if source_id in self.rows:
            return self.rows[source_id]
        path, expected = SOURCE_FILES[source_id]
        resolved = validate_source_path(source_id, path)
        rows: list[dict[str, str | None]] = []
        with resolved.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            validate_header(source_id, expected, reader.fieldnames)
            for row_number, row in enumerate(reader, start=2):
                if None in row:
                    raise ExportValidationError(
                        f"{source_id} row {row_number}: extra CSV fields"
                    )
                rows.append(row)
        self.rows[source_id] = rows
        self.metadata[source_id] = {
            "source_id": source_id,
            "file_name": resolved.name,
            "row_count": len(rows),
            "sha256": sha256(resolved),
        }
        return rows


def raw(row: dict[str, str | None], key: str, context: str) -> str:
    value = row.get(key)
    if value is None:
        raise ExportValidationError(f"{context}: missing {key!r}")
    if value != value.strip():
        raise ExportValidationError(f"{context}: padded value in {key!r}")
    return value


def required_text(row: dict[str, str | None], key: str, context: str) -> str:
    value = raw(row, key, context)
    if not value:
        raise ExportValidationError(f"{context}: empty {key!r}")
    return value


def optional_text(row: dict[str, str | None], key: str, context: str) -> str | None:
    return raw(row, key, context) or None


def number(
    row: dict[str, str | None], key: str, context: str, *, integer: bool = False
) -> float | int | None:
    value = raw(row, key, context)
    if value == "":
        return None
    try:
        parsed = float(value)
    except ValueError as exc:
        raise ExportValidationError(f"{context}: non-numeric {key!r}") from exc
    if not math.isfinite(parsed):
        raise ExportValidationError(f"{context}: non-finite {key!r}")
    if integer:
        if not parsed.is_integer():
            raise ExportValidationError(f"{context}: non-integer {key!r}")
        return int(parsed)
    return parsed


def required_integer(row: dict[str, str | None], key: str, context: str) -> int:
    value = number(row, key, context, integer=True)
    if value is None:
        raise ExportValidationError(f"{context}: empty {key!r}")
    return value


def boolean(
    row: dict[str, str | None], key: str, context: str, *, allow_empty: bool = False
) -> bool | None:
    value = raw(row, key, context).casefold()
    if value == "" and allow_empty:
        return None
    if value == "true":
        return True
    if value == "false":
        return False
    raise ExportValidationError(f"{context}: invalid Boolean {key!r}")


def slug(value: str) -> str:
    result = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    if not result:
        raise ExportValidationError("cannot create an empty feature slug")
    return result


def parse_model(row: dict[str, str | None], context: str) -> str | None:
    model = required_text(row, "model", context)
    if model == "unadjusted":
        return None
    normalized = model.upper()
    if normalized not in MODELS or model != model.casefold():
        raise ExportValidationError(f"{context}: unsupported model {model!r}")
    return normalized


def parse_contrast(row: dict[str, str | None], context: str) -> str:
    contrast = required_text(row, "contrast", context)
    if contrast not in CONTRASTS:
        raise ExportValidationError(f"{context}: unsupported contrast {contrast!r}")
    return contrast


def validate_probability(value: float | None, field: str, context: str) -> None:
    if value is not None and not 0 <= value <= 1:
        raise ExportValidationError(f"{context}: {field} outside [0, 1]")


def effect_type_for(spec: AnalysisSpec, contrast: str) -> str:
    return spec.omnibus_effect if contrast == "omnibus" else spec.primary_effect


def effect_scale_for(spec: AnalysisSpec, effect_type: str) -> str:
    if effect_type == "OR":
        return "odds ratio"
    if effect_type == "IRR":
        return "incidence rate ratio"
    if effect_type == "beta" and spec.analysis_id in {
        "labwas_mean",
        "labwas_median",
        "behwas_continuous",
    }:
        return "rank-inverse-normal standard-deviation beta"
    if effect_type == "beta":
        return "linear-model coefficient"
    if effect_type == "wald_F":
        return "Wald F statistic"
    if effect_type == "wald_chi2":
        return "Wald chi-square statistic"
    raise ExportValidationError(f"{spec.analysis_id}: unsupported effect type")


def neutral_value(effect_type: str) -> float | int:
    if effect_type in {"OR", "IRR"}:
        return 1
    if effect_type in {"beta", "wald_F", "wald_chi2"}:
        return 0
    raise ExportValidationError(f"unsupported neutral value for {effect_type!r}")


def association_record(
    row: dict[str, str | None],
    spec: AnalysisSpec,
    feature: Feature,
    contrast: str,
    context: str,
    *,
    n_secondary: int | None,
    prevalence: float | None,
) -> dict[str, Any]:
    expected_effect = effect_type_for(spec, contrast)
    source_effect = required_text(row, "effect_type", context)
    if source_effect not in {expected_effect, "na"}:
        raise ExportValidationError(
            f"{context}: expected {expected_effect!r}, found {source_effect!r}"
        )

    effect = number(row, "effect", context)
    se = number(row, "se", context)
    ci_low = number(row, "ci_low", context)
    ci_high = number(row, "ci_high", context)
    p = number(row, "p", context)
    neglog10p = number(row, "neglog10p", context)
    validate_probability(p, "p", context)
    if neglog10p is not None and neglog10p < 0:
        raise ExportValidationError(f"{context}: negative neglog10p")
    if prevalence is not None:
        validate_probability(prevalence, "prevalence", context)
    if n_secondary is not None and n_secondary < 0:
        raise ExportValidationError(f"{context}: negative secondary count")

    reason = optional_text(row, "unstable", context)
    unavailable = source_effect == "na" or effect is None or p is None
    if unavailable and reason is None:
        reason = "not_estimable"
    if source_effect == "na" and any(
        value is not None for value in (effect, se, ci_low, ci_high, p, neglog10p)
    ):
        raise ExportValidationError(f"{context}: na row contains association values")
    if expected_effect in {"OR", "IRR"}:
        for field, value in (("effect", effect), ("ci_low", ci_low), ("ci_high", ci_high)):
            if value is not None and value <= 0:
                raise ExportValidationError(f"{context}: non-positive ratio {field}")
    if ci_low is not None and ci_high is not None and ci_low > ci_high:
        raise ExportValidationError(f"{context}: reversed confidence interval")
    if contrast != "omnibus" and not unavailable:
        if se is None or ci_low is None or ci_high is None:
            raise ExportValidationError(f"{context}: directional estimate lacks SE or CI")

    sig_fdr = boolean(row, "sig_fdr", context)
    sig_bon = boolean(row, "sig_bon", context)
    if unavailable and (sig_fdr or sig_bon):
        raise ExportValidationError(f"{context}: unavailable estimate marked significant")

    return {
        "feature_key": feature.feature_key,
        "feature_id": feature.feature_id,
        "feature_name": feature.feature_name,
        "category": feature.category,
        "subgroup": feature.subgroup,
        "effect_type": expected_effect,
        "effect": effect,
        "se": se,
        "ci_low": ci_low,
        "ci_high": ci_high,
        "p": p,
        "neglog10p": neglog10p,
        "sig_fdr": sig_fdr,
        "sig_bon": sig_bon,
        "unstable": reason is not None,
        "unstable_reason": reason,
        "n": required_integer(row, "n", context),
        "n_secondary": n_secondary,
        "prevalence": prevalence,
        "label_review_required": feature.label_review_required,
    }


class ExportBuilder:
    def __init__(self, release_id: str) -> None:
        self.release_id = release_id
        self.sources = SourceCache()
        self.partitions: dict[
            tuple[str, str, str, str], list[dict[str, Any]]
        ] = defaultdict(list)
        self.partition_keys: dict[tuple[str, str, str, str], set[str]] = defaultdict(set)
        self.registry: dict[str, dict[str, Any]] = {}

    def add(
        self,
        spec: AnalysisSpec,
        window: str,
        model: str,
        contrast: str,
        feature: Feature,
        record: dict[str, Any],
        context: str,
    ) -> None:
        if window not in WINDOW_ORDER:
            raise ExportValidationError(f"{context}: unsupported window {window!r}")
        if feature.code_system != spec.code_system:
            raise ExportValidationError(f"{context}: feature code-system mismatch")
        key = (spec.analysis_id, window, model, contrast)
        if feature.feature_key in self.partition_keys[key]:
            raise ExportValidationError(f"{context}: duplicate feature in partition")
        self.partition_keys[key].add(feature.feature_key)
        self.partitions[key].append(record)
        self.add_registry(spec, window, feature, context)

    def add_registry(
        self, spec: AnalysisSpec, window: str, feature: Feature, context: str
    ) -> None:
        entry = self.registry.get(feature.feature_key)
        stable = {
            "feature_id": feature.feature_id,
            "family": spec.family,
            "category": feature.category,
            "subgroup": feature.subgroup,
            "code_system": feature.code_system,
        }
        if entry is None:
            self.registry[feature.feature_key] = {
                **stable,
                "feature_name": feature.feature_name,
                "names": {feature.feature_name},
                "analysis_ids": {spec.analysis_id},
                "windows": {window},
                "label_review_required": feature.label_review_required,
            }
            return
        if any(entry[field] != value for field, value in stable.items()):
            raise ExportValidationError(f"{context}: inconsistent feature registry metadata")
        entry["names"].add(feature.feature_name)
        entry["analysis_ids"].add(spec.analysis_id)
        entry["windows"].add(window)
        entry["label_review_required"] = bool(
            entry["label_review_required"] or feature.label_review_required
        )

    def load_lab(self) -> None:
        labels: dict[str, tuple[str, str]] = {}
        for index, row in enumerate(self.sources.read("lab_labels"), start=2):
            context = f"lab_labels row {index}"
            code = required_text(row, "loinc_code", context)
            if code in labels:
                raise ExportValidationError(f"{context}: duplicate LOINC")
            labels[code] = (
                required_text(row, "loinc_long_common_name", context),
                required_text(row, "category", context),
            )

        counts: dict[str, dict[str, Any]] = {}
        for index, row in enumerate(self.sources.read("lab_counts"), start=2):
            context = f"lab_counts row {index}"
            code = required_text(row, "loinc_code", context)
            if code in counts:
                raise ExportValidationError(f"{context}: duplicate LOINC")
            if code not in labels:
                raise ExportValidationError(f"{context}: missing canonical LOINC label")
            name, category = labels[code]
            if required_text(row, "loinc_long_common_name", context) != name:
                raise ExportValidationError(f"{context}: inconsistent LOINC name")
            if required_text(row, "category", context) != category:
                raise ExportValidationError(f"{context}: inconsistent LOINC category")
            counts[code] = {
                "1yr": (
                    required_integer(row, "n_1yr", context),
                    number(row, "prevalence_1yr", context),
                    boolean(row, "in_analysis_1yr", context),
                ),
                "5yr": (
                    required_integer(row, "n_5yr", context),
                    number(row, "prevalence_5yr", context),
                    boolean(row, "in_analysis_5yr", context),
                ),
            }

        target_specs = {
            "mean": ANALYSES["labwas_mean"],
            "median": ANALYSES["labwas_median"],
            "order_rate": ANALYSES["labwas_order_rate"],
        }
        for window in ("1yr", "5yr"):
            for index, row in enumerate(
                self.sources.read(f"lab_results_{window}"), start=2
            ):
                context = f"lab_results_{window} row {index}"
                if required_text(row, "window", context) != window:
                    raise ExportValidationError(f"{context}: window mismatch")
                model = parse_model(row, context)
                if model is None:
                    continue
                target = required_text(row, "target", context)
                if target not in target_specs:
                    raise ExportValidationError(f"{context}: unsupported lab target")
                spec = target_specs[target]
                contrast = parse_contrast(row, context)
                code = required_text(row, "loinc_code", context)
                if code not in labels or code not in counts:
                    raise ExportValidationError(f"{context}: missing LOINC metadata")
                name, category = labels[code]
                if required_text(row, "category", context) != category:
                    raise ExportValidationError(f"{context}: LOINC category mismatch")
                n_secondary, prevalence, in_analysis = counts[code][window]
                if not in_analysis:
                    raise ExportValidationError(f"{context}: excluded LOINC in results")
                feature = Feature(
                    f"labwas:{code}", code, name, category, None, "LOINC", False
                )
                record = association_record(
                    row,
                    spec,
                    feature,
                    contrast,
                    context,
                    n_secondary=n_secondary,
                    prevalence=prevalence,
                )
                self.add(spec, window, model, contrast, feature, record, context)

            spec = ANALYSES["labwas_order_propensity"]
            for index, row in enumerate(
                self.sources.read(f"lab_propensity_{window}"), start=2
            ):
                context = f"lab_propensity_{window} row {index}"
                if required_text(row, "window", context) != window:
                    raise ExportValidationError(f"{context}: window mismatch")
                model = parse_model(row, context)
                if model is None:
                    continue
                contrast = parse_contrast(row, context)
                code = required_text(row, "loinc_code", context)
                if code not in labels or code not in counts:
                    raise ExportValidationError(f"{context}: missing LOINC metadata")
                name, category = labels[code]
                if required_text(row, "category", context) != category:
                    raise ExportValidationError(f"{context}: LOINC category mismatch")
                n_secondary, companion_prevalence, in_analysis = counts[code][window]
                if not in_analysis:
                    raise ExportValidationError(f"{context}: excluded LOINC in results")
                prevalence = number(row, "prevalence", context)
                if prevalence is None:
                    raise ExportValidationError(f"{context}: missing prevalence")
                if companion_prevalence is None or abs(prevalence - companion_prevalence) > 0.00011:
                    raise ExportValidationError(f"{context}: inconsistent prevalence companion")
                feature = Feature(
                    f"labwas:{code}", code, name, category, None, "LOINC", False
                )
                record = association_record(
                    row,
                    spec,
                    feature,
                    contrast,
                    context,
                    n_secondary=n_secondary,
                    prevalence=prevalence,
                )
                self.add(spec, window, model, contrast, feature, record, context)

    def load_med(self) -> None:
        labels: dict[str, tuple[str, str, bool]] = {}
        for index, row in enumerate(self.sources.read("med_labels"), start=2):
            context = f"med_labels row {index}"
            code = required_text(row, "code", context)
            if not re.fullmatch(r"\d{4}", code):
                raise ExportValidationError(f"{context}: invalid zero-preserved GPI-4 code")
            if code in labels:
                raise ExportValidationError(f"{context}: duplicate GPI-4 code")
            labels[code] = (
                required_text(row, "drug_class_name", context),
                required_text(row, "category", context),
                bool(boolean(row, "needs_review", context)),
            )

        spec = ANALYSES["medwas_fill"]
        for window in ("1yr", "5yr"):
            for index, row in enumerate(
                self.sources.read(f"med_results_{window}"), start=2
            ):
                context = f"med_results_{window} row {index}"
                if required_text(row, "window", context) != window:
                    raise ExportValidationError(f"{context}: window mismatch")
                if required_text(row, "target", context) != "filled":
                    raise ExportValidationError(f"{context}: unsupported medication target")
                model = parse_model(row, context)
                if model is None:
                    continue
                contrast = parse_contrast(row, context)
                code = required_text(row, "code", context)
                if code not in labels:
                    raise ExportValidationError(f"{context}: missing GPI-4 label")
                name, category, review = labels[code]
                n = required_integer(row, "n", context)
                n_filled = required_integer(row, "n_filled", context)
                if n_filled > n:
                    raise ExportValidationError(f"{context}: filled count exceeds model n")
                feature = Feature(
                    f"medwas:{code}", code, name, category, None, "GPI-4", review
                )
                record = association_record(
                    row,
                    spec,
                    feature,
                    contrast,
                    context,
                    n_secondary=n_filled,
                    prevalence=n_filled / n,
                )
                self.add(spec, window, model, contrast, feature, record, context)

    def load_beh(self) -> None:
        rows = self.sources.read("beh_results")
        source_outcomes = {required_text(row, "outcome", "beh_results") for row in rows}
        if source_outcomes != set(BEHAVIOR_LABELS):
            raise ExportValidationError(
                "beh_results: outcome-label schema mismatch; "
                f"missing={sorted(source_outcomes - set(BEHAVIOR_LABELS))}, "
                f"unused={sorted(set(BEHAVIOR_LABELS) - source_outcomes)}"
            )
        for index, row in enumerate(rows, start=2):
            context = f"beh_results row {index}"
            model = parse_model(row, context)
            if model is None:
                continue
            contrast = parse_contrast(row, context)
            window = required_text(row, "window", context)
            outcome = required_text(row, "outcome", context)
            name, category, expected_kind = BEHAVIOR_LABELS[outcome]
            kind = required_text(row, "kind", context)
            if kind != expected_kind:
                raise ExportValidationError(f"{context}: behavior kind mismatch")
            spec = ANALYSES[f"behwas_{kind}"]
            feature = Feature(
                f"behwas:{outcome}",
                outcome,
                name,
                category,
                None,
                "EHR behavior",
                False,
            )
            record = association_record(
                row,
                spec,
                feature,
                contrast,
                context,
                n_secondary=None,
                prevalence=None,
            )
            self.add(spec, window, model, contrast, feature, record, context)

    def load_proc(self) -> None:
        spec = ANALYSES["procwas_rate"]
        slug_owners: dict[str, str] = {}
        for window in ("1yr", "5yr"):
            count_rows = self.sources.read(f"proc_counts_{window}")
            counts: dict[str, tuple[str, str, int]] = {}
            for index, row in enumerate(count_rows, start=2):
                context = f"proc_counts_{window} row {index}"
                feature_name = required_text(row, "clear_descriptor", context)
                if feature_name in counts:
                    raise ExportValidationError(f"{context}: duplicate procedure descriptor")
                counts[feature_name] = (
                    required_text(row, "procedure_type", context),
                    required_text(row, "body_system", context),
                    required_integer(row, "n_pat", context),
                )
            for index, row in enumerate(
                self.sources.read(f"proc_results_{window}"), start=2
            ):
                context = f"proc_results_{window} row {index}"
                if required_text(row, "window", context) != window:
                    raise ExportValidationError(f"{context}: window mismatch")
                if required_text(row, "part", context) != "rate":
                    raise ExportValidationError(f"{context}: unsupported procedure part")
                model = parse_model(row, context)
                if model is None:
                    continue
                contrast = parse_contrast(row, context)
                name = required_text(row, "feature", context)
                if name not in counts:
                    raise ExportValidationError(f"{context}: missing procedure count companion")
                procedure_type, body_system, n_pat = counts[name]
                if required_text(row, "procedure_type", context) != procedure_type:
                    raise ExportValidationError(f"{context}: procedure type mismatch")
                if required_text(row, "body_system", context) != body_system:
                    raise ExportValidationError(f"{context}: procedure body-system mismatch")
                feature_slug = slug(name)
                owner = slug_owners.setdefault(feature_slug, name)
                if owner != name:
                    raise ExportValidationError(f"{context}: procedure slug collision")
                feature = Feature(
                    f"procwas:{feature_slug}",
                    name,
                    name,
                    body_system,
                    procedure_type,
                    "EHR procedure descriptor",
                    False,
                )
                record = association_record(
                    row,
                    spec,
                    feature,
                    contrast,
                    context,
                    n_secondary=n_pat,
                    prevalence=None,
                )
                self.add(spec, window, model, contrast, feature, record, context)

    def load_util_phecodes(self) -> None:
        specs = {
            "presence": ANALYSES["utilwas_presence"],
            "count_among_present": ANALYSES["utilwas_count_present"],
        }
        for window in ("1yr", "5yr"):
            counts: dict[tuple[str, str], tuple[str, str, int]] = {}
            for index, row in enumerate(
                self.sources.read(f"util_phecode_counts_{window}"), start=2
            ):
                context = f"util_phecode_counts_{window} row {index}"
                key = (
                    required_text(row, "combo", context),
                    required_text(row, "phecode", context),
                )
                if key in counts:
                    raise ExportValidationError(f"{context}: duplicate utilization PheCode")
                counts[key] = (
                    required_text(row, "phenotype", context),
                    required_text(row, "category", context),
                    required_integer(row, "n_pat", context),
                )
            for index, row in enumerate(
                self.sources.read(f"util_phecode_results_{window}"), start=2
            ):
                context = f"util_phecode_results_{window} row {index}"
                if required_text(row, "window", context) != window:
                    raise ExportValidationError(f"{context}: window mismatch")
                part = required_text(row, "part", context)
                if part not in specs:
                    raise ExportValidationError(f"{context}: unsupported utilization part")
                model = parse_model(row, context)
                if model is None:
                    continue
                contrast = parse_contrast(row, context)
                combo = required_text(row, "combo", context)
                if combo not in UTIL_SUBGROUPS:
                    raise ExportValidationError(f"{context}: unsupported care-setting combo")
                code = required_text(row, "feature", context)
                key = (combo, code)
                if key not in counts:
                    raise ExportValidationError(f"{context}: missing utilization count companion")
                name, category, n_pat = counts[key]
                if required_text(row, "phenotype", context) != name:
                    raise ExportValidationError(f"{context}: PheCode name mismatch")
                if required_text(row, "category", context) != category:
                    raise ExportValidationError(f"{context}: PheCode category mismatch")
                spec = specs[part]
                feature = Feature(
                    f"utilwas:{combo}:phecode:{code}",
                    code,
                    name,
                    category,
                    UTIL_SUBGROUPS[combo],
                    "PheCode",
                    False,
                )
                record = association_record(
                    row,
                    spec,
                    feature,
                    contrast,
                    context,
                    n_secondary=n_pat,
                    prevalence=None,
                )
                self.add(spec, window, model, contrast, feature, record, context)

    def load_util_specialties(self) -> None:
        spec = ANALYSES["utilwas_specialty_rate"]
        slug_owners: dict[tuple[str, str], str] = {}
        for window in ("1yr", "5yr"):
            counts: dict[tuple[str, str], int] = {}
            for index, row in enumerate(
                self.sources.read(f"util_specialty_counts_{window}"), start=2
            ):
                context = f"util_specialty_counts_{window} row {index}"
                family = required_text(row, "family", context)
                if family not in SPECIALTY_SUBGROUPS:
                    raise ExportValidationError(f"{context}: unsupported specialty family")
                key = (family, required_text(row, "dept_specialty", context))
                if key in counts:
                    raise ExportValidationError(f"{context}: duplicate specialty count")
                counts[key] = required_integer(row, "n_pat", context)
            for index, row in enumerate(
                self.sources.read(f"util_specialty_results_{window}"), start=2
            ):
                context = f"util_specialty_results_{window} row {index}"
                if required_text(row, "window", context) != window:
                    raise ExportValidationError(f"{context}: window mismatch")
                if required_text(row, "part", context) != "rate":
                    raise ExportValidationError(f"{context}: unsupported specialty part")
                model = parse_model(row, context)
                if model is None:
                    continue
                contrast = parse_contrast(row, context)
                family = required_text(row, "family", context)
                if family not in SPECIALTY_SUBGROUPS:
                    raise ExportValidationError(f"{context}: unsupported specialty family")
                name = required_text(row, "feature", context)
                key = (family, name)
                if key not in counts:
                    raise ExportValidationError(f"{context}: missing specialty count companion")
                feature_slug = slug(name)
                slug_key = (family, feature_slug)
                owner = slug_owners.setdefault(slug_key, name)
                if owner != name:
                    raise ExportValidationError(f"{context}: specialty slug collision")
                feature = Feature(
                    f"utilwas:{family}:specialty:{feature_slug}",
                    name,
                    name,
                    "Healthcare specialty",
                    SPECIALTY_SUBGROUPS[family],
                    "EHR specialty",
                    False,
                )
                record = association_record(
                    row,
                    spec,
                    feature,
                    contrast,
                    context,
                    n_secondary=counts[key],
                    prevalence=None,
                )
                self.add(spec, window, model, contrast, feature, record, context)

    def build(self) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
        self.load_lab()
        self.load_med()
        self.load_beh()
        self.load_proc()
        self.load_util_phecodes()
        self.load_util_specialties()
        if set(ANALYSES) != {key[0] for key in self.partitions}:
            missing = set(ANALYSES) - {key[0] for key in self.partitions}
            raise ExportValidationError(f"missing analyses: {sorted(missing)}")

        outputs: dict[str, dict[str, Any]] = {}
        partition_manifest = []
        for key in sorted(
            self.partitions,
            key=lambda value: (
                ANALYSIS_RANK[value[0]],
                WINDOW_ORDER[value[1]],
                MODELS.index(value[2]),
                CONTRASTS.index(value[3]),
            ),
        ):
            analysis_id, window, model, contrast = key
            spec = ANALYSES[analysis_id]
            records = sorted(
                self.partitions[key],
                key=lambda record: (
                    record["category"].casefold(),
                    (record["subgroup"] or "").casefold(),
                    record["feature_name"].casefold(),
                    record["feature_key"],
                ),
            )
            expected_effect = effect_type_for(spec, contrast)
            if {record["effect_type"] for record in records} != {expected_effect}:
                raise ExportValidationError(f"{key}: heterogeneous partition")
            path = f"was/{analysis_id}/{window}/{model.casefold()}/{contrast}.json"
            metadata = {
                "analysis_id": analysis_id,
                "family": spec.family,
                "label": spec.label,
                "window": window,
                "model": model,
                "contrast": contrast,
                "effect_type": expected_effect,
                "effect_scale": effect_scale_for(spec, expected_effect),
                "neutral_value": neutral_value(expected_effect),
                "directional": contrast != "omnibus",
                "code_system": spec.code_system,
                "row_count": len(records),
                "release_status": spec.release_status,
                "release_note": spec.release_note,
                "sample_n_label": spec.sample_n_label,
                "secondary_n_label": spec.secondary_n_label,
            }
            payload = {
                "schema_version": SCHEMA_VERSION,
                "metadata": metadata,
                "columns": aligned_columns(records, OUTPUT_COLUMNS, path),
            }
            outputs[path] = payload
            partition_manifest.append({"path": path, **metadata})

        registry_records = []
        for feature_key, entry in sorted(
            self.registry.items(),
            key=lambda item: (
                item[1]["family"].casefold(),
                item[1]["feature_name"].casefold(),
                item[0],
            ),
        ):
            names = entry.pop("names")
            registry_records.append(
                {
                    "feature_key": feature_key,
                    "feature_id": entry["feature_id"],
                    "feature_name": entry["feature_name"],
                    "family": entry["family"],
                    "analysis_ids": sorted(
                        entry["analysis_ids"], key=lambda value: ANALYSIS_RANK[value]
                    ),
                    "category": entry["category"],
                    "subgroup": entry["subgroup"],
                    "code_system": entry["code_system"],
                    "alternate_names": sorted(
                        names - {entry["feature_name"]}, key=str.casefold
                    ),
                    "windows": sorted(entry["windows"], key=lambda value: WINDOW_ORDER[value]),
                    "label_review_required": entry["label_review_required"],
                }
            )
        features_payload = {
            "schema_version": SCHEMA_VERSION,
            "metadata": {
                "dataset": "osa-multiwas-feature-registry",
                "release_id": self.release_id,
                "row_count": len(registry_records),
            },
            "columns": aligned_columns(
                registry_records, REGISTRY_COLUMNS, "was-features.json"
            ),
        }
        outputs["was-features.json"] = features_payload

        analyses_manifest = []
        for analysis_id, spec in ANALYSES.items():
            parts = [
                item for item in partition_manifest if item["analysis_id"] == analysis_id
            ]
            analyses_manifest.append(
                {
                    "analysis_id": analysis_id,
                    "family": spec.family,
                    "label": spec.label,
                    "code_system": spec.code_system,
                    "release_status": spec.release_status,
                    "release_note": spec.release_note,
                    "windows": sorted(
                        {item["window"] for item in parts},
                        key=lambda value: WINDOW_ORDER[value],
                    ),
                    "models": [
                        model for model in MODELS if any(item["model"] == model for item in parts)
                    ],
                    "contrasts": [
                        contrast
                        for contrast in CONTRASTS
                        if any(item["contrast"] == contrast for item in parts)
                    ],
                    "feature_count": len(
                        {
                            feature_key
                            for feature_key, entry in self.registry.items()
                            if analysis_id in entry["analysis_ids"]
                        }
                    ),
                    "partition_count": len(parts),
                }
            )

        default_path = "was/labwas_mean/1yr/m4/severe_vs_none.json"
        if default_path not in outputs or not outputs[default_path]["metadata"]["row_count"]:
            raise ExportValidationError("default multi-WAS partition is unavailable")
        manifest = {
            "schema_version": SCHEMA_VERSION,
            "exporter_version": EXPORTER_VERSION,
            "release": {
                "id": self.release_id,
                "audience": "researchers",
                "scope": "Aggregate OSA LabWAS, MedWAS, BehWAS, ProcWAS, and UtilWAS results",
            },
            "defaults": {
                "analysis_id": "labwas_mean",
                "window": "1yr",
                "model": "M4",
                "contrast": "severe_vs_none",
                "partition_path": default_path,
            },
            "models": list(MODELS),
            "contrasts": list(CONTRASTS),
            "features": {
                "path": "was-features.json",
                "row_count": len(registry_records),
            },
            "analyses": analyses_manifest,
            "sources": [self.sources.metadata[key] for key in sorted(self.sources.metadata)],
            "partitions": partition_manifest,
        }
        outputs["was-manifest.json"] = manifest
        return outputs, manifest


def aligned_columns(
    records: list[dict[str, Any]], expected: tuple[str, ...], context: str
) -> dict[str, list[Any]]:
    expected_set = set(expected)
    if any(set(record) != expected_set for record in records):
        raise ExportValidationError(f"{context}: output schema mismatch")
    columns = {field: [record[field] for record in records] for field in expected}
    if {len(values) for values in columns.values()} != {len(records)}:
        raise ExportValidationError(f"{context}: unaligned output columns")
    return columns


def reject_absolute_paths(value: Any, context: str = "payload") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            reject_absolute_paths(child, f"{context}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            reject_absolute_paths(child, f"{context}[{index}]")
    elif isinstance(value, float) and not math.isfinite(value):
        raise ExportValidationError(f"non-finite output at {context}")
    elif isinstance(value, str) and (
        re.match(r"^[A-Za-z]:[\\/]", value) or value.startswith(("/", "\\\\"))
    ):
        raise ExportValidationError(f"absolute path leaked at {context}")


def write_json(relative_path: str, payload: dict[str, Any]) -> None:
    destination = (OUTPUT_ROOT / relative_path).resolve()
    if not destination.is_relative_to(OUTPUT_ROOT.resolve()):
        raise ExportValidationError("output path escapes public/data")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(
                payload,
                handle,
                ensure_ascii=False,
                allow_nan=False,
                separators=(",", ":"),
            )
            handle.write("\n")
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()


def main() -> int:
    release_id = parse_args().release_id
    validate_release(release_id)
    outputs, manifest = ExportBuilder(release_id).build()
    for path, payload in outputs.items():
        reject_absolute_paths(payload)
        write_json(path, payload)
    source_rows = {item["source_id"]: item["row_count"] for item in manifest["sources"]}
    print(
        json.dumps(
            {
                "output_root": "public/data",
                "files_written": len(outputs),
                "analysis_count": len(manifest["analyses"]),
                "feature_count": manifest["features"]["row_count"],
                "partition_count": len(manifest["partitions"]),
                "association_rows": sum(
                    item["row_count"] for item in manifest["partitions"]
                ),
                "source_rows": source_rows,
                "default_partition": manifest["defaults"]["partition_path"],
            },
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
