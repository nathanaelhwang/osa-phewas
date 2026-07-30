#!/usr/bin/env python3
"""Export allowlisted aggregate octant-phenotype assets for the website.

Only the disclosure-reviewed aggregate website export and fixed publication
figures are read. Patient-level phenotype assignments are intentionally out of
scope. Curves are withheld when the corresponding focal event count is
suppressed below the public reporting threshold.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import re
import shutil
import struct
from collections import defaultdict
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 2
CURVE_SCHEMA_VERSION = 2
EXPORTER_VERSION = "2.1.0"
RELEASE_ID = "2026-07-29"
DISCLOSURE_THRESHOLD = 11
EVENT_COUNT_WITHHOLDING_REASON = (
    "Complementary suppression prevents reconstruction of rare focal event counts."
)

WEBSITE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WEBSITE_ROOT.parent
EXPORT_ROOT = (
    PROJECT_ROOT
    / "results"
    / "incwas_results"
    / "phenotype_exposure"
    / "website_exports"
)
PHENOTYPE_PLOT_ROOT = PROJECT_ROOT / "latent-class-analysis" / "results" / "plots"
SURVIVAL_PLOT_ROOT = (
    PROJECT_ROOT
    / "results"
    / "incwas_results"
    / "phenotype_exposure"
    / "survival_plots"
)
OUTPUT_DATA = WEBSITE_ROOT / "public" / "data" / "phenotypes.json"
OUTPUT_CURVES = WEBSITE_ROOT / "public" / "data" / "phenotype-survival"
OUTPUT_IMAGES = WEBSITE_ROOT / "public" / "images" / "phenotypes"

OCTANT_ORDER = (
    "mild-all",
    "hypoxemia-predominant",
    "symptom-predominant",
    "comorbidity-predominant",
    "hypoxemic-symptomatic",
    "hypoxemic-comorbid",
    "symptomatic-comorbid",
    "high-all",
)
OCTANT_BITS = {
    "mild-all": (0, 0, 0),
    "hypoxemia-predominant": (1, 0, 0),
    "symptom-predominant": (0, 1, 0),
    "comorbidity-predominant": (0, 0, 1),
    "hypoxemic-symptomatic": (1, 1, 0),
    "hypoxemic-comorbid": (1, 0, 1),
    "symptomatic-comorbid": (0, 1, 1),
    "high-all": (1, 1, 1),
}
OCTANT_SUMMARIES = {
    "mild-all": "Below the cohort median on physiologic severity, symptoms, and comorbidity burden.",
    "hypoxemia-predominant": "Higher nocturnal hypoxemia with comparatively low symptom and comorbidity burden.",
    "symptom-predominant": "Higher sleepiness and insomnia burden despite comparatively mild physiologic disturbance.",
    "comorbidity-predominant": "Higher coded disease burden with comparatively low physiologic and symptom scores.",
    "hypoxemic-symptomatic": "Higher physiologic severity and symptom burden without high comorbidity burden.",
    "hypoxemic-comorbid": "Higher physiologic severity and comorbidity burden with comparatively low symptom burden.",
    "symptomatic-comorbid": "Higher symptom and comorbidity burden with comparatively mild physiologic disturbance.",
    "high-all": "Above the cohort median on all three phenotype axes.",
}

AXES = (
    {
        "id": "physiologic",
        "score": "score_c1",
        "label": "Physiologic severity",
        "high_label": "Higher hypoxemia burden",
        "description": "Sleep-study physiology including oxygen desaturation and saturation burden.",
    },
    {
        "id": "symptom",
        "score": "score_c2",
        "label": "Symptom burden",
        "high_label": "Higher symptom burden",
        "description": "Sleepiness, insomnia, functional impairment, mood screening, and related symptoms.",
    },
    {
        "id": "comorbidity",
        "score": "score_c3",
        "label": "Comorbidity burden",
        "high_label": "Higher coded burden",
        "description": "A broad coded-disease gradient that also reflects healthcare contact and record completeness.",
    },
)

CSV_FIELDS = {
    "octant_cluster_summary.csv": {
        "octant", "label", "glyph", "axes_high", "physiology_high",
        "symptom_high", "comorbidity_high", "n", "pct", "median_ahi",
        "median_phecodes", "score_c1_cut", "score_c2_cut", "score_c3_cut",
        "classification_coverage_pct", "cut_point_basis",
    },
    "octant_cluster_distributions.csv": {
        "octant", "metric_id", "metric_label", "domain", "metric_type", "unit",
        "n_nonmissing", "coverage_pct", "estimate", "mean", "sd", "median", "q1",
        "q3", "numerator", "denominator", "proportion", "cohort_estimate",
        "standardized_difference", "suppressed",
    },
    "octant_score_correlations.csv": {"score_x", "score_y", "spearman_rho"},
    "octant_cif_metadata.csv": {
        "level", "outcome", "outcome_name", "category", "octant", "contrast",
        "model", "hr_m4", "se", "ci_low", "ci_high", "p", "q_fdr", "sig_fdr",
        "sig_bon", "omnibus_p_m4", "omnibus_q_m4", "omnibus_sig_fdr", "n_focal",
        "events_focal", "n_rest", "events_rest", "cif3_focal_pct",
        "cif3_rest_pct", "penalizer", "unstable", "ph_p", "currently_published",
        "selection_scope", "event_definition", "suppressed",
    },
    "octant_cif_curves.csv": {
        "level", "outcome", "outcome_name", "category", "octant", "group",
        "time_years", "cif_pct",
    },
    "octant_cif_risk_table.csv": {
        "level", "outcome", "octant", "group", "time_years", "n_at_risk",
        "n_events_cum", "suppressed",
    },
    "octant_cif_overall_curves.csv": {
        "level", "outcome", "outcome_name", "category", "group",
        "time_years", "cif_pct", "curve_status", "suppressed",
    },
    "octant_cif_overall_risk_table.csv": {
        "level", "outcome", "outcome_name", "category", "group",
        "time_years", "n_at_risk", "n_events_cum", "suppressed",
    },
    "octant_cif_overall_metadata.csv": {
        "level", "outcome", "outcome_name", "category",
        "n_at_risk_baseline", "total_events", "cif3_pct",
        "mean_followup_years", "n_at_risk_3yr",
        "pct_baseline_at_risk_3yr", "curve_status", "suppressed",
        "event_definition", "estimator", "competing_event", "time_origin",
    },
}

PUBLIC_EXPORT_FILES = tuple(CSV_FIELDS)
OVERALL_AUDIT_FILE = "octant_cif_overall_audit.json"

IMAGE_SOURCES = {
    "construction": (
        PHENOTYPE_PLOT_ROOT / "fig12_octant_construction.png",
        PHENOTYPE_PLOT_ROOT,
        "octant-construction.png",
        (2055, 1269),
    ),
    "signature": (
        PHENOTYPE_PLOT_ROOT / "fig13_octant_signature.png",
        PHENOTYPE_PLOT_ROOT,
        "octant-signature.png",
        (1657, 1472),
    ),
    "phecode_survival": (
        SURVIVAL_PLOT_ROOT / "octant_cif_phecode.png",
        SURVIVAL_PLOT_ROOT,
        "octant-cif-phecode.png",
        (2257, 1180),
    ),
    "system_survival": (
        SURVIVAL_PLOT_ROOT / "octant_cif_system.png",
        SURVIVAL_PLOT_ROOT,
        "octant-cif-system.png",
        (2281, 2932),
    ),
}


class ExportValidationError(RuntimeError):
    pass


def allowlisted_path(path: Path, root: Path, context: str) -> Path:
    resolved_root = root.resolve(strict=True)
    resolved = path.resolve(strict=True)
    if not resolved.is_relative_to(resolved_root):
        raise ExportValidationError(f"{context}: source escaped allowlisted directory")
    return resolved


def export_path(file_name: str) -> Path:
    if file_name not in CSV_FIELDS:
        raise ExportValidationError(f"unexpected aggregate file: {file_name}")
    return allowlisted_path(EXPORT_ROOT / file_name, EXPORT_ROOT, file_name)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path, root: Path, context: str) -> dict[str, Any]:
    with allowlisted_path(path, root, context).open(encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ExportValidationError(f"{context}: expected an object")
    return payload


def read_csv(file_name: str) -> list[dict[str, str]]:
    with export_path(file_name).open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames
        expected = CSV_FIELDS[file_name]
        if fields is None or set(fields) != expected or len(fields) != len(set(fields)):
            raise ExportValidationError(f"{file_name}: unexpected CSV schema")
        rows: list[dict[str, str]] = []
        for row_number, row in enumerate(reader, start=2):
            if None in row or any(value is None for value in row.values()):
                raise ExportValidationError(f"{file_name} row {row_number}: malformed CSV")
            rows.append({key: value for key, value in row.items() if key is not None})
    if not rows:
        raise ExportValidationError(f"{file_name}: empty CSV")
    return rows


def finite(value: str, context: str) -> float:
    try:
        parsed = float(value)
    except ValueError as exc:
        raise ExportValidationError(f"{context}: non-numeric value") from exc
    if not math.isfinite(parsed):
        raise ExportValidationError(f"{context}: non-finite value")
    return parsed


def nullable_finite(value: str, context: str) -> float | None:
    return None if value == "" else finite(value, context)


def whole(value: str, context: str) -> int:
    parsed = finite(value, context)
    if not parsed.is_integer():
        raise ExportValidationError(f"{context}: non-integer value")
    return int(parsed)


def nullable_whole(value: str, context: str) -> int | None:
    return None if value == "" else whole(value, context)


def boolean(value: str, context: str) -> bool:
    if value == "True":
        return True
    if value == "False":
        return False
    raise ExportValidationError(f"{context}: expected True or False")


def validate_overall_manifest(
    manifest: dict[str, Any], inventory: dict[str, dict[str, Any]]
) -> None:
    overall = manifest.get("overall_exports")
    if not isinstance(overall, dict):
        raise ExportValidationError("export manifest: overall export approval missing")
    expected_inventory = {
        "octant_cif_overall_curves.csv": (2_520, 120),
        "octant_cif_overall_risk_table.csv": (84, None),
        "octant_cif_overall_metadata.csv": (21, None),
    }
    declared = {
        "octant_cif_overall_curves.csv": overall.get("curves"),
        "octant_cif_overall_risk_table.csv": overall.get("risk_table"),
        "octant_cif_overall_metadata.csv": overall.get("metadata"),
    }
    for file_name, (expected_rows, expected_points) in expected_inventory.items():
        entry = declared[file_name]
        if (
            not isinstance(entry, dict)
            or entry.get("file") != file_name
            or entry.get("rows") != expected_rows
        ):
            raise ExportValidationError(f"export manifest: invalid approval for {file_name}")
        if expected_points is not None and entry.get("points_per_curve") != expected_points:
            raise ExportValidationError("export manifest: invalid overall curve grid approval")
    risk_approval = overall.get("risk_table")
    if not isinstance(risk_approval, dict) or risk_approval.get("times_years") != [0.0, 1.0, 2.0, 3.0]:
        raise ExportValidationError("export manifest: invalid overall risk-table grid approval")
    if (
        overall.get("group") != "all"
        or overall.get("outcomes") != 21
        or overall.get("direct_estimation_confirmed") is not True
        or overall.get("raw_partition_reconciled") is not True
        or overall.get("permutation_invariant") is not True
        or overall.get("risk_counts_permutation_invariant") is not True
        or overall.get("existing_focal_curves_unchanged") is not True
        or overall.get("curves_are_adjusted") is not False
        or overall.get("competing_event") != "death"
    ):
        raise ExportValidationError("export manifest: overall direct-estimation approval did not pass")

    audit_name = overall.get("audit")
    audit_entry = inventory.get(OVERALL_AUDIT_FILE)
    audit_path = allowlisted_path(
        EXPORT_ROOT / OVERALL_AUDIT_FILE, EXPORT_ROOT, OVERALL_AUDIT_FILE
    )
    if (
        audit_name != OVERALL_AUDIT_FILE
        or audit_entry is None
        or audit_entry.get("internal") is not False
        or audit_entry.get("bytes") != audit_path.stat().st_size
        or audit_entry.get("sha256") != sha256(audit_path)
    ):
        raise ExportValidationError("overall audit: manifest integrity mismatch")
    audit = read_json(audit_path, EXPORT_ROOT, "overall export audit")
    audit_validation = audit.get("validation")
    direct_estimation = audit.get("direct_estimation")
    checks = audit_validation.get("checks") if isinstance(audit_validation, dict) else None
    direct_check_passed = isinstance(checks, list) and any(
        isinstance(check, dict)
        and check.get("check") == 28
        and check.get("status") == "PASS"
        for check in checks
    )
    if (
        not isinstance(audit_validation, dict)
        or audit_validation.get("status") != "PASS"
        or audit_validation.get("n_failed") != 0
        or not direct_check_passed
        or not isinstance(direct_estimation, dict)
        or direct_estimation.get("group") != "all"
        or direct_estimation.get("confirmed") is not True
        or direct_estimation.get("raw_partition_reconciled") is not True
    ):
        raise ExportValidationError("overall audit: direct-estimation validation did not pass")


def validate_manifest() -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    manifest_path = EXPORT_ROOT / "phenotype_website_export_manifest.json"
    manifest = read_json(manifest_path, EXPORT_ROOT, "export manifest")
    validation = manifest.get("validation")
    if not isinstance(validation, dict) or validation.get("status") != "PASS" or validation.get("n_failed") != 0:
        raise ExportValidationError("export manifest: source validation did not pass")
    entries = manifest.get("files")
    if not isinstance(entries, list):
        raise ExportValidationError("export manifest: file inventory missing")
    by_name: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("name"), str):
            raise ExportValidationError("export manifest: malformed file entry")
        by_name[entry["name"]] = entry
    for file_name in PUBLIC_EXPORT_FILES:
        entry = by_name.get(file_name)
        path = export_path(file_name)
        if entry is None or entry.get("internal") is not False:
            raise ExportValidationError(f"{file_name}: not approved as a public aggregate")
        if entry.get("bytes") != path.stat().st_size or entry.get("sha256") != sha256(path):
            raise ExportValidationError(f"{file_name}: manifest integrity mismatch")
    validate_overall_manifest(manifest, by_name)
    return manifest, by_name


def validate_row_count(file_name: str, rows: list[dict[str, str]], inventory: dict[str, dict[str, Any]]) -> None:
    if inventory[file_name].get("rows") != len(rows):
        raise ExportValidationError(f"{file_name}: row count differs from manifest")


def load_clusters(
    inventory: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, float], list[dict[str, Any]], dict[str, dict[str, float]]]:
    summary_rows = read_csv("octant_cluster_summary.csv")
    validate_row_count("octant_cluster_summary.csv", summary_rows, inventory)
    if len(summary_rows) != 8:
        raise ExportValidationError("cluster summary: expected eight rows")

    by_octant: dict[str, dict[str, Any]] = {}
    cuts_by_score: dict[str, set[float]] = {"score_c1": set(), "score_c2": set(), "score_c3": set()}
    for row in summary_rows:
        octant = row["octant"]
        if octant not in OCTANT_BITS or octant in by_octant:
            raise ExportValidationError("cluster summary: unexpected or duplicate octant")
        bits = OCTANT_BITS[octant]
        parsed_bits = (
            1 if boolean(row["physiology_high"], f"{octant} physiology_high") else 0,
            1 if boolean(row["symptom_high"], f"{octant} symptom_high") else 0,
            1 if boolean(row["comorbidity_high"], f"{octant} comorbidity_high") else 0,
        )
        if parsed_bits != bits:
            raise ExportValidationError(f"{octant}: axis flags do not match the octant")
        count = whole(row["n"], f"{octant} n")
        pct = finite(row["pct"], f"{octant} pct") / 100
        coverage = finite(row["classification_coverage_pct"], f"{octant} coverage")
        if count < DISCLOSURE_THRESHOLD or not 0 < pct < 1 or coverage != 100:
            raise ExportValidationError(f"{octant}: invalid public cluster summary")
        for score in cuts_by_score:
            cuts_by_score[score].add(finite(row[f"{score}_cut"], f"{octant} {score} cut"))
        by_octant[octant] = {
            "id": octant,
            "label": octant.replace("-", " ").title(),
            "glyph": row["glyph"],
            "bits": list(bits),
            "n": count,
            "pct": pct,
            "median_ahi": finite(row["median_ahi"], f"{octant} median AHI"),
            "median_codes": finite(row["median_phecodes"], f"{octant} median phecodes"),
            "summary": OCTANT_SUMMARIES[octant],
        }
    if set(by_octant) != set(OCTANT_ORDER) or sum(row["n"] for row in by_octant.values()) != 70_880:
        raise ExportValidationError("cluster summary: cohort reconciliation failed")
    if not math.isclose(sum(row["pct"] for row in by_octant.values()), 1, abs_tol=0.00001):
        raise ExportValidationError("cluster summary: percentages do not reconcile")
    if any(len(values) != 1 for values in cuts_by_score.values()):
        raise ExportValidationError("cluster summary: inconsistent score cut points")
    cut_points = {score: next(iter(values)) for score, values in cuts_by_score.items()}

    distribution_rows = read_csv("octant_cluster_distributions.csv")
    validate_row_count("octant_cluster_distributions.csv", distribution_rows, inventory)
    if len(distribution_rows) != 234:
        raise ExportValidationError("cluster distributions: unexpected row count")
    metric_groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in distribution_rows:
        metric_groups[row["metric_id"]].append(row)
    if len(metric_groups) != 26:
        raise ExportValidationError("cluster distributions: expected 26 measures")

    metrics: list[dict[str, Any]] = []
    for metric_id, rows in metric_groups.items():
        if {row["octant"] for row in rows} != {*OCTANT_ORDER, "overall"} or len(rows) != 9:
            raise ExportValidationError(f"{metric_id}: incomplete group coverage")
        identity = {(row["metric_label"], row["domain"], row["metric_type"], row["unit"]) for row in rows}
        if len(identity) != 1:
            raise ExportValidationError(f"{metric_id}: inconsistent metric metadata")
        label, domain, metric_type, unit = next(iter(identity))
        if metric_type not in {"continuous", "binary"}:
            raise ExportValidationError(f"{metric_id}: unexpected metric type")

        summaries: dict[str, dict[str, Any]] = {}
        for row in rows:
            context = f"{metric_id} {row['octant']}"
            suppressed = boolean(row["suppressed"], f"{context} suppressed")
            if suppressed:
                raise ExportValidationError(f"{context}: cluster aggregate unexpectedly suppressed")
            summary = {
                "n_nonmissing": whole(row["n_nonmissing"], f"{context} n_nonmissing"),
                "coverage_pct": finite(row["coverage_pct"], f"{context} coverage_pct"),
                "estimate": finite(row["estimate"], f"{context} estimate"),
                "mean": nullable_finite(row["mean"], f"{context} mean"),
                "sd": nullable_finite(row["sd"], f"{context} sd"),
                "median": nullable_finite(row["median"], f"{context} median"),
                "q1": nullable_finite(row["q1"], f"{context} q1"),
                "q3": nullable_finite(row["q3"], f"{context} q3"),
                "numerator": nullable_whole(row["numerator"], f"{context} numerator"),
                "denominator": nullable_whole(row["denominator"], f"{context} denominator"),
                "proportion": nullable_finite(row["proportion"], f"{context} proportion"),
                "cohort_estimate": finite(row["cohort_estimate"], f"{context} cohort_estimate"),
                "standardized_difference": finite(
                    row["standardized_difference"], f"{context} standardized_difference"
                ),
                "suppressed": False,
            }
            if not 0 <= summary["coverage_pct"] <= 100:
                raise ExportValidationError(f"{context}: invalid coverage")
            if metric_type == "continuous":
                if any(summary[key] is None for key in ("mean", "sd", "median", "q1", "q3")):
                    raise ExportValidationError(f"{context}: incomplete continuous summary")
                if any(summary[key] is not None for key in ("numerator", "denominator", "proportion")):
                    raise ExportValidationError(f"{context}: binary fields on a continuous metric")
            else:
                if any(summary[key] is not None for key in ("mean", "sd", "median", "q1", "q3")):
                    raise ExportValidationError(f"{context}: continuous fields on a binary metric")
                if any(summary[key] is None for key in ("numerator", "denominator", "proportion")):
                    raise ExportValidationError(f"{context}: incomplete binary summary")
                if summary["numerator"] < DISCLOSURE_THRESHOLD:
                    raise ExportValidationError(f"{context}: sub-threshold numerator")
            summaries[row["octant"]] = summary
        overall = summaries.pop("overall")
        if not math.isclose(overall["standardized_difference"], 0, abs_tol=1e-9):
            raise ExportValidationError(f"{metric_id}: overall standardized difference is not zero")
        metrics.append(
            {
                "id": metric_id,
                "label": label,
                "domain": domain,
                "metric_type": metric_type,
                "unit": unit,
                "overall": overall,
                "by_octant": {octant: summaries[octant] for octant in OCTANT_ORDER},
            }
        )

    correlation_rows = read_csv("octant_score_correlations.csv")
    validate_row_count("octant_score_correlations.csv", correlation_rows, inventory)
    if len(correlation_rows) != 9:
        raise ExportValidationError("score correlations: expected a 3 by 3 matrix")
    scores = {"score_c1", "score_c2", "score_c3"}
    correlations: dict[str, dict[str, float]] = {score: {} for score in scores}
    for row in correlation_rows:
        score_x, score_y = row["score_x"], row["score_y"]
        if score_x not in scores or score_y not in scores or score_y in correlations[score_x]:
            raise ExportValidationError("score correlations: invalid matrix key")
        correlations[score_x][score_y] = finite(row["spearman_rho"], f"{score_x} {score_y}")
    for score_x in scores:
        if set(correlations[score_x]) != scores:
            raise ExportValidationError("score correlations: incomplete matrix")
        for score_y in scores:
            if not math.isclose(correlations[score_x][score_y], correlations[score_y][score_x], abs_tol=1e-12):
                raise ExportValidationError("score correlations: asymmetric matrix")
        if not math.isclose(correlations[score_x][score_x], 1, abs_tol=1e-12):
            raise ExportValidationError("score correlations: invalid diagonal")

    return [by_octant[octant] for octant in OCTANT_ORDER], cut_points, metrics, correlations


def load_metadata(inventory: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows = read_csv("octant_cif_metadata.csv")
    validate_row_count("octant_cif_metadata.csv", rows, inventory)
    if len(rows) != 168:
        raise ExportValidationError("survival metadata: expected 168 panels")
    records: list[dict[str, Any]] = []
    keys: set[tuple[str, str, str]] = set()
    for row_number, row in enumerate(rows, start=2):
        context = f"survival metadata row {row_number}"
        level, outcome, octant = row["level"], row["outcome"], row["octant"]
        key = (level, outcome, octant)
        if level not in {"phecode", "system"} or octant not in OCTANT_BITS or key in keys:
            raise ExportValidationError(f"{context}: invalid or duplicate panel")
        if level == "phecode" and not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", outcome):
            raise ExportValidationError(f"{context}: unsafe PheCode")
        keys.add(key)
        suppressed = boolean(row["suppressed"], f"{context} suppressed")
        n_focal = whole(row["n_focal"], f"{context} n_focal")
        n_rest = whole(row["n_rest"], f"{context} n_rest")
        events_focal = nullable_whole(row["events_focal"], f"{context} events_focal")
        events_rest = nullable_whole(row["events_rest"], f"{context} events_rest")
        if min(n_focal, n_rest) < DISCLOSURE_THRESHOLD:
            raise ExportValidationError(f"{context}: sub-threshold risk set")
        for count in (events_focal, events_rest):
            if count is not None and count < DISCLOSURE_THRESHOLD:
                raise ExportValidationError(f"{context}: unsuppressed small event count")
        if suppressed != (events_focal is None or events_rest is None):
            raise ExportValidationError(f"{context}: suppression flag mismatch")
        hr = finite(row["hr_m4"], f"{context} HR")
        ci_low = finite(row["ci_low"], f"{context} CI low")
        ci_high = finite(row["ci_high"], f"{context} CI high")
        if not 0 < ci_low <= hr <= ci_high:
            raise ExportValidationError(f"{context}: invalid hazard-ratio interval")
        unstable = row["unstable"] or None
        if unstable not in {None, "epv<10"}:
            raise ExportValidationError(f"{context}: unexpected stability flag")
        if row["ph_p"] != "":
            raise ExportValidationError(f"{context}: ph_p should be unavailable")
        sig_fdr = boolean(row["sig_fdr"], f"{context} sig_fdr")
        sig_bon = boolean(row["sig_bon"], f"{context} sig_bon")
        published = boolean(row["currently_published"], f"{context} currently_published")
        if published != sig_bon:
            raise ExportValidationError(f"{context}: published flag differs from Bonferroni")
        record = {
            "octant": octant,
            "contrast": row["contrast"],
            "model": row["model"].upper(),
            "hr_m4": hr,
            "se": finite(row["se"], f"{context} SE"),
            "ci_low": ci_low,
            "ci_high": ci_high,
            "p": finite(row["p"], f"{context} p"),
            "q_fdr": finite(row["q_fdr"], f"{context} q_fdr"),
            "sig_fdr": sig_fdr,
            "sig_bon": sig_bon,
            "omnibus_p_m4": finite(row["omnibus_p_m4"], f"{context} omnibus p"),
            "omnibus_q_m4": finite(row["omnibus_q_m4"], f"{context} omnibus q"),
            "omnibus_sig_fdr": boolean(row["omnibus_sig_fdr"], f"{context} omnibus sig_fdr"),
            "n_focal": n_focal,
            "events_focal": events_focal,
            "n_rest": n_rest,
            "events_rest": events_rest,
            "cif3_focal_pct": finite(row["cif3_focal_pct"], f"{context} focal CIF"),
            "cif3_rest_pct": finite(row["cif3_rest_pct"], f"{context} rest CIF"),
            "penalizer": finite(row["penalizer"], f"{context} penalizer"),
            "unstable": unstable,
            "ph_p": None,
            "currently_published": published,
            "suppressed": suppressed,
            "curve_available": not suppressed,
        }
        if any(not 0 <= record[field] <= 1 for field in ("p", "q_fdr", "omnibus_p_m4", "omnibus_q_m4")):
            raise ExportValidationError(f"{context}: invalid probability")
        if any(not 0 <= record[field] <= 100 for field in ("cif3_focal_pct", "cif3_rest_pct")):
            raise ExportValidationError(f"{context}: invalid cumulative incidence")
        record.update(
            {
                "level": level,
                "outcome_id": outcome,
                "outcome_name": row["outcome_name"],
                "category": row["category"],
                "selection_scope": row["selection_scope"],
                "event_definition": row["event_definition"],
            }
        )
        records.append(record)
    if sum(row["level"] == "phecode" for row in records) != 120:
        raise ExportValidationError("survival metadata: expected 120 PheCode panels")
    if sum(row["level"] == "system" for row in records) != 48:
        raise ExportValidationError("survival metadata: expected 48 system panels")
    if sum(row["sig_fdr"] for row in records) != 31 or sum(row["sig_bon"] for row in records) != 21:
        raise ExportValidationError("survival metadata: significance totals changed")
    if sum(row["unstable"] == "epv<10" for row in records) != 80:
        raise ExportValidationError("survival metadata: EPV warning total changed")
    if sum(row["suppressed"] for row in records) != 16:
        raise ExportValidationError("survival metadata: suppression total changed")
    return records


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not slug:
        raise ExportValidationError("outcome identifier cannot form a safe asset name")
    return slug


def load_overall_assets(
    inventory: dict[str, dict[str, Any]], metadata: list[dict[str, Any]]
) -> dict[tuple[str, str], dict[str, Any]]:
    curve_rows = read_csv("octant_cif_overall_curves.csv")
    risk_rows = read_csv("octant_cif_overall_risk_table.csv")
    metadata_rows = read_csv("octant_cif_overall_metadata.csv")
    for file_name, rows, expected_count in (
        ("octant_cif_overall_curves.csv", curve_rows, 2_520),
        ("octant_cif_overall_risk_table.csv", risk_rows, 84),
        ("octant_cif_overall_metadata.csv", metadata_rows, 21),
    ):
        validate_row_count(file_name, rows, inventory)
        if len(rows) != expected_count:
            raise ExportValidationError(f"{file_name}: unexpected row count")

    panels_by_outcome: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for panel in metadata:
        panels_by_outcome[(panel["level"], panel["outcome_id"])].append(panel)
    if len(panels_by_outcome) != 21:
        raise ExportValidationError("overall assets: expected 21 outcome keys")
    expected_identity: dict[tuple[str, str], tuple[str, str, str]] = {}
    for key, panels in panels_by_outcome.items():
        if len(panels) != 8 or {panel["octant"] for panel in panels} != set(OCTANT_ORDER):
            raise ExportValidationError(f"overall assets: incomplete octant panels for {key}")
        identities = {
            (panel["outcome_name"], panel["category"], panel["event_definition"])
            for panel in panels
        }
        if len(identities) != 1:
            raise ExportValidationError(f"overall assets: inconsistent outcome metadata for {key}")
        expected_identity[key] = next(iter(identities))

    overall_metadata: dict[tuple[str, str], dict[str, Any]] = {}
    for row_number, row in enumerate(metadata_rows, start=2):
        context = f"overall metadata row {row_number}"
        key = (row["level"], row["outcome"])
        if key not in expected_identity or key in overall_metadata:
            raise ExportValidationError(f"{context}: unexpected or duplicate outcome key")
        outcome_name, category, event_definition = expected_identity[key]
        if (
            row["outcome_name"] != outcome_name
            or row["category"] != category
            or row["event_definition"] != event_definition
        ):
            raise ExportValidationError(f"{context}: outcome identity differs from panel metadata")
        suppressed = boolean(row["suppressed"], f"{context} suppressed")
        counts = {
            "n_at_risk_baseline": nullable_whole(
                row["n_at_risk_baseline"], f"{context} n_at_risk_baseline"
            ),
            "total_events": nullable_whole(row["total_events"], f"{context} total_events"),
            "n_at_risk_3yr": nullable_whole(
                row["n_at_risk_3yr"], f"{context} n_at_risk_3yr"
            ),
        }
        if (
            row["curve_status"] != "available"
            or suppressed
            or any(count is None for count in counts.values())
        ):
            raise ExportValidationError(f"{context}: pooled curve is not approved as available")
        if any(count < DISCLOSURE_THRESHOLD for count in counts.values() if count is not None):
            raise ExportValidationError(f"{context}: unsuppressed small count")
        baseline = counts["n_at_risk_baseline"]
        total_events = counts["total_events"]
        at_risk_3yr = counts["n_at_risk_3yr"]
        assert baseline is not None and total_events is not None and at_risk_3yr is not None
        if total_events > baseline or at_risk_3yr > baseline:
            raise ExportValidationError(f"{context}: count exceeds the baseline risk set")
        cif3 = finite(row["cif3_pct"], f"{context} cif3_pct")
        mean_followup = finite(row["mean_followup_years"], f"{context} mean follow-up")
        pct_at_risk = finite(
            row["pct_baseline_at_risk_3yr"], f"{context} pct_baseline_at_risk_3yr"
        )
        if not 0 <= cif3 <= 100 or not 0 <= mean_followup <= 3 or not 0 <= pct_at_risk <= 100:
            raise ExportValidationError(f"{context}: value outside the approved range")
        if not math.isclose(100 * at_risk_3yr / baseline, pct_at_risk, abs_tol=0.00005):
            raise ExportValidationError(f"{context}: 3-year at-risk percentage does not reconcile")
        if (
            "Aalen-Johansen" not in row["estimator"]
            or row["competing_event"] != "death"
            or not row["time_origin"]
        ):
            raise ExportValidationError(f"{context}: unexpected estimator definition")
        overall_metadata[key] = {
            "n_at_risk_baseline": baseline,
            "total_events": None,
            "cif3_pct": cif3,
            "mean_followup_years": mean_followup,
            "n_at_risk_3yr": at_risk_3yr,
            "pct_baseline_at_risk_3yr": pct_at_risk,
            "curve_status": "available",
            "suppressed": False,
            "event_counts_withheld": True,
            "event_count_withholding_reason": EVENT_COUNT_WITHHOLDING_REASON,
            "event_definition": row["event_definition"],
            "estimator": row["estimator"],
            "competing_event": row["competing_event"],
            "time_origin": row["time_origin"],
        }
    if set(overall_metadata) != set(expected_identity):
        raise ExportValidationError("overall metadata: outcome keys do not match panel metadata")

    grouped_curves: dict[tuple[str, str], list[tuple[float, float]]] = defaultdict(list)
    for row_number, row in enumerate(curve_rows, start=2):
        context = f"overall curve row {row_number}"
        key = (row["level"], row["outcome"])
        if key not in expected_identity:
            raise ExportValidationError(f"{context}: unexpected outcome key")
        outcome_name, category, _ = expected_identity[key]
        if row["outcome_name"] != outcome_name or row["category"] != category:
            raise ExportValidationError(f"{context}: outcome identity differs from panel metadata")
        if (
            row["group"] != "all"
            or row["curve_status"] != "available"
            or boolean(row["suppressed"], f"{context} suppressed")
        ):
            raise ExportValidationError(f"{context}: pooled curve is not approved as available")
        grouped_curves[key].append(
            (finite(row["time_years"], context), finite(row["cif_pct"], context))
        )
    if set(grouped_curves) != set(expected_identity):
        raise ExportValidationError("overall curves: outcome keys do not match panel metadata")

    curves: dict[tuple[str, str], dict[str, list[float]]] = {}
    reference_times: list[float] | None = None
    for key, points in grouped_curves.items():
        points.sort(key=lambda point: point[0])
        times = [point[0] for point in points]
        values = [point[1] for point in points]
        if (
            len(points) != 120
            or not math.isclose(times[0], 0)
            or not math.isclose(times[-1], 3)
            or any(right <= left for left, right in zip(times, times[1:]))
        ):
            raise ExportValidationError(f"overall curve {key}: invalid 120-point time grid")
        if reference_times is None:
            reference_times = times
        elif times != reference_times:
            raise ExportValidationError(f"overall curve {key}: time grid differs across outcomes")
        if (
            not math.isclose(values[0], 0, abs_tol=1e-12)
            or any(value < 0 or value > 100 for value in values)
            or any(right + 1e-10 < left for left, right in zip(values, values[1:]))
        ):
            raise ExportValidationError(f"overall curve {key}: cumulative incidence is invalid")
        if not math.isclose(
            values[-1], overall_metadata[key]["cif3_pct"], abs_tol=0.0001
        ):
            raise ExportValidationError(f"overall curve {key}: endpoint differs from metadata")
        curves[key] = {"time_years": times, "cif_pct": values}

    grouped_risk: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row_number, row in enumerate(risk_rows, start=2):
        context = f"overall risk row {row_number}"
        key = (row["level"], row["outcome"])
        if key not in expected_identity:
            raise ExportValidationError(f"{context}: unexpected outcome key")
        outcome_name, category, _ = expected_identity[key]
        if row["outcome_name"] != outcome_name or row["category"] != category or row["group"] != "all":
            raise ExportValidationError(f"{context}: invalid pooled risk-table identity")
        n_at_risk = nullable_whole(row["n_at_risk"], f"{context} n_at_risk")
        n_events = nullable_whole(row["n_events_cum"], f"{context} n_events_cum")
        suppressed = boolean(row["suppressed"], f"{context} suppressed")
        if suppressed != (n_at_risk is None or n_events is None):
            raise ExportValidationError(f"{context}: suppression flag mismatch")
        for count in (n_at_risk, n_events):
            if count is not None and count < DISCLOSURE_THRESHOLD:
                raise ExportValidationError(f"{context}: unsuppressed small count")
        if n_at_risk is None:
            raise ExportValidationError(f"{context}: at-risk count is unavailable")
        grouped_risk[key].append(
            {
                "time_years": finite(row["time_years"], context),
                "n_at_risk": n_at_risk,
                "n_events_cum": n_events,
                "suppressed": suppressed,
            }
        )
    if set(grouped_risk) != set(expected_identity):
        raise ExportValidationError("overall risk tables: outcome keys do not match panel metadata")

    for key, rows in grouped_risk.items():
        rows.sort(key=lambda row: row["time_years"])
        if [row["time_years"] for row in rows] != [0.0, 1.0, 2.0, 3.0]:
            raise ExportValidationError(f"overall risk table {key}: unexpected time points")
        risks = [row["n_at_risk"] for row in rows]
        if any(right > left for left, right in zip(risks, risks[1:])):
            raise ExportValidationError(f"overall risk table {key}: risk set increases")
        disclosed_events = [
            row["n_events_cum"] for row in rows if row["n_events_cum"] is not None
        ]
        if any(right < left for left, right in zip(disclosed_events, disclosed_events[1:])):
            raise ExportValidationError(f"overall risk table {key}: event count decreases")
        if (
            risks[0] != overall_metadata[key]["n_at_risk_baseline"]
            or risks[-1] != overall_metadata[key]["n_at_risk_3yr"]
        ):
            raise ExportValidationError(f"overall risk table {key}: endpoints differ from metadata")

    return {
        key: {
            "curve_status": "available",
            "curve": curves[key],
            "risk_table": [
                {
                    **row,
                    "n_events_cum": None,
                    "suppressed": True,
                }
                for row in grouped_risk[key]
            ],
            "metadata": overall_metadata[key],
        }
        for key in expected_identity
    }


def load_curve_assets(
    inventory: dict[str, dict[str, Any]],
    metadata: list[dict[str, Any]],
    overall_assets: dict[tuple[str, str], dict[str, Any]],
) -> tuple[dict[tuple[str, str], dict[str, Any]], int]:
    curve_rows = read_csv("octant_cif_curves.csv")
    risk_rows = read_csv("octant_cif_risk_table.csv")
    validate_row_count("octant_cif_curves.csv", curve_rows, inventory)
    validate_row_count("octant_cif_risk_table.csv", risk_rows, inventory)
    if len(curve_rows) != 40_320 or len(risk_rows) != 1_344:
        raise ExportValidationError("curve assets: unexpected row counts")

    curve_series: dict[tuple[str, str, str, str], list[tuple[float, float]]] = defaultdict(list)
    for row_number, row in enumerate(curve_rows, start=2):
        context = f"curve row {row_number}"
        key = (row["level"], row["outcome"], row["octant"], row["group"])
        if key[0] not in {"phecode", "system"} or key[2] not in OCTANT_BITS or key[3] not in {"focal", "other_seven"}:
            raise ExportValidationError(f"{context}: invalid series key")
        curve_series[key].append((finite(row["time_years"], context), finite(row["cif_pct"], context)))

    risk_series: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row_number, row in enumerate(risk_rows, start=2):
        context = f"risk row {row_number}"
        key = (row["level"], row["outcome"], row["octant"], row["group"])
        if key[0] not in {"phecode", "system"} or key[2] not in OCTANT_BITS or key[3] not in {"focal", "other_seven"}:
            raise ExportValidationError(f"{context}: invalid series key")
        suppressed = boolean(row["suppressed"], f"{context} suppressed")
        events = nullable_whole(row["n_events_cum"], f"{context} events")
        if suppressed != (events is None):
            raise ExportValidationError(f"{context}: suppression flag mismatch")
        if events is not None and events < DISCLOSURE_THRESHOLD:
            raise ExportValidationError(f"{context}: unsuppressed small event count")
        risk_series[key].append(
            {
                "time_years": finite(row["time_years"], context),
                "n_at_risk": whole(row["n_at_risk"], f"{context} n_at_risk"),
                "n_events_cum": events,
                "suppressed": suppressed,
            }
        )

    metadata_by_panel = {
        (row["level"], row["outcome_id"], row["octant"]): row for row in metadata
    }
    expected_curve_keys = {
        (*panel, group) for panel in metadata_by_panel for group in ("focal", "other_seven")
    }
    if set(curve_series) != expected_curve_keys or set(risk_series) != expected_curve_keys:
        raise ExportValidationError("curve assets: series do not match metadata panels")

    for key, points in curve_series.items():
        points.sort(key=lambda point: point[0])
        times = [point[0] for point in points]
        values = [point[1] for point in points]
        if len(points) != 120 or not math.isclose(times[0], 0) or not math.isclose(times[-1], 3):
            raise ExportValidationError(f"curve {key}: invalid time grid")
        if any(right <= left for left, right in zip(times, times[1:])):
            raise ExportValidationError(f"curve {key}: times are not strictly increasing")
        if any(value < 0 or value > 100 for value in values) or any(
            right + 1e-10 < left for left, right in zip(values, values[1:])
        ):
            raise ExportValidationError(f"curve {key}: cumulative incidence is invalid")
        panel = metadata_by_panel[key[:3]]
        endpoint = panel["cif3_focal_pct"] if key[3] == "focal" else panel["cif3_rest_pct"]
        if not math.isclose(values[-1], endpoint, abs_tol=0.00005):
            raise ExportValidationError(f"curve {key}: endpoint differs from metadata")

    for key, rows in risk_series.items():
        rows.sort(key=lambda row: row["time_years"])
        if [row["time_years"] for row in rows] != [0.0, 1.0, 2.0, 3.0]:
            raise ExportValidationError(f"risk table {key}: unexpected time points")
        risks = [row["n_at_risk"] for row in rows]
        if any(right > left for left, right in zip(risks, risks[1:])):
            raise ExportValidationError(f"risk table {key}: risk set increases")
        disclosed_events = [row["n_events_cum"] for row in rows if row["n_events_cum"] is not None]
        if any(right < left for left, right in zip(disclosed_events, disclosed_events[1:])):
            raise ExportValidationError(f"risk table {key}: event count decreases")

    panels_by_outcome: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in metadata:
        panels_by_outcome[(row["level"], row["outcome_id"])].append(row)
    if set(overall_assets) != set(panels_by_outcome):
        raise ExportValidationError("overall assets: outcome keys do not match curve panels")
    assets: dict[tuple[str, str], dict[str, Any]] = {}
    paths: set[str] = set()
    withheld = 0
    for outcome_key, panels in panels_by_outcome.items():
        level, outcome = outcome_key
        panels.sort(key=lambda panel: OCTANT_ORDER.index(panel["octant"]))
        if len(panels) != 8:
            raise ExportValidationError(f"{outcome_key}: expected all eight octants")
        slug = safe_slug(outcome)
        relative_path = f"data/phenotype-survival/{level}/{slug}.json"
        if relative_path in paths:
            raise ExportValidationError(f"{outcome_key}: curve asset path collision")
        paths.add(relative_path)
        asset_panels: list[dict[str, Any]] = []
        for panel in panels:
            octant = panel["octant"]
            risk_table = {
                group: risk_series[(level, outcome, octant, group)]
                for group in ("focal", "other_seven")
            }
            if panel["suppressed"]:
                withheld += 1
                asset_panels.append(
                    {
                        "octant": octant,
                        "curve_status": "withheld_event_count_suppression",
                        "curves": None,
                        "risk_table": risk_table,
                    }
                )
                continue
            curves = {}
            for group in ("focal", "other_seven"):
                points = curve_series[(level, outcome, octant, group)]
                curves[group] = {
                    "time_years": [point[0] for point in points],
                    "cif_pct": [point[1] for point in points],
                }
            asset_panels.append(
                {
                    "octant": octant,
                    "curve_status": "available",
                    "curves": curves,
                    "risk_table": risk_table,
                }
            )
        first = panels[0]
        assets[outcome_key] = {
            "relative_path": relative_path,
            "payload": {
                "schema_version": CURVE_SCHEMA_VERSION,
                "level": level,
                "outcome_id": outcome,
                "outcome_name": first["outcome_name"],
                "category": first["category"],
                "overall": overall_assets[outcome_key],
                "panels": asset_panels,
            },
        }
    if withheld != 16:
        raise ExportValidationError("curve assets: suppressed-panel withholding total changed")
    return assets, withheld


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ExportValidationError(f"{path.name}: invalid PNG")
    return struct.unpack(">II", header[16:24])


def image_records() -> dict[str, dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    for image_id, (source, root, output_name, expected) in IMAGE_SOURCES.items():
        path = allowlisted_path(source, root, image_id)
        dimensions = png_dimensions(path)
        if dimensions != expected:
            raise ExportValidationError(f"{image_id}: unexpected image dimensions")
        records[image_id] = {
            "path": f"images/phenotypes/{output_name}",
            "width": dimensions[0],
            "height": dimensions[1],
        }
    return records


def reject_path_leaks(value: Any, context: str = "payload") -> None:
    forbidden = re.compile(
        r"octant_assignments|cross_domain_phenotypes|(?:[A-Za-z]:[\\/])|(?:https?|file)://|\bmrn\b",
        re.IGNORECASE,
    )
    if isinstance(value, dict):
        for key, child in value.items():
            reject_path_leaks(child, f"{context}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            reject_path_leaks(child, f"{context}[{index}]")
    elif isinstance(value, float) and not math.isfinite(value):
        raise ExportValidationError(f"non-finite output at {context}")
    elif isinstance(value, str):
        if forbidden.search(value):
            raise ExportValidationError(f"forbidden text or path leaked at {context}")
        if ".." in re.split(r"[\\/]", value):
            raise ExportValidationError(f"parent path segment leaked at {context}")


def build() -> tuple[dict[str, Any], dict[tuple[str, str], dict[str, Any]]]:
    manifest, inventory = validate_manifest()
    octants, cut_points, metrics, correlations = load_clusters(inventory)
    metadata = load_metadata(inventory)
    overall_assets = load_overall_assets(inventory, metadata)
    curve_assets, withheld = load_curve_assets(inventory, metadata, overall_assets)
    images = image_records()

    levels: list[dict[str, Any]] = []
    for level, label, description in (
        (
            "phecode",
            "PheCode outcomes",
            "Incident rule-of-2 PheCodes among people free of the PheCode and its control-exclusion family at index.",
        ),
        (
            "system",
            "Body-system outcomes",
            "First new PheCode in the system with the whole cohort at risk; diagnostic accrual, not first-ever disease onset.",
        ),
    ):
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in metadata:
            if row["level"] == level:
                grouped[row["outcome_id"]].append(row)
        outcomes = []
        for outcome_id, panels in grouped.items():
            panels.sort(key=lambda panel: OCTANT_ORDER.index(panel["octant"]))
            first = panels[0]
            public_panels = [
                {key: value for key, value in panel.items() if key not in {
                    "level", "outcome_id", "outcome_name", "category", "selection_scope", "event_definition"
                }}
                for panel in panels
            ]
            outcomes.append(
                {
                    "outcome_id": outcome_id,
                    "outcome_name": first["outcome_name"],
                    "category": first["category"],
                    "asset_path": curve_assets[(level, outcome_id)]["relative_path"],
                    "panels": public_panels,
                }
            )
        outcomes.sort(key=lambda outcome: (outcome["outcome_name"].lower(), outcome["outcome_id"]))
        levels.append(
            {
                "id": level,
                "label": label,
                "description": description,
                "panel_count": sum(len(outcome["panels"]) for outcome in outcomes),
                "outcomes": outcomes,
                "image": images[f"{level}_survival"],
            }
        )

    payload = {
        "schema_version": SCHEMA_VERSION,
        "exporter_version": EXPORTER_VERSION,
        "release": {
            "id": RELEASE_ID,
            "audience": "public researchers",
            "status": "public_research_release",
        },
        "construction": {
            "shared_cohort_n": 70_880,
            "classification_coverage_pct": 100,
            "method": "Each posterior-weighted domain score is split at its shared-cohort median.",
            "cut_points": cut_points,
            "cut_point_note": "Cohort-derived medians are descriptive, not clinical thresholds, and do not transfer unchanged to another sample.",
            "axis_order": [axis["id"] for axis in AXES],
            "axes": list(AXES),
            "score_spearman": correlations,
            "image": images["construction"],
        },
        "octants": octants,
        "cluster_profiles": {
            "metrics": metrics,
            "standardized_difference_definition": manifest["cluster_tables"]["standardized_difference_definition"],
            "estimate_note": "Continuous matrix values are means; binary values are proportions. Detailed cards also show medians, quartiles, denominators, and coverage.",
        },
        "signature_figure": images["signature"],
        "survival": {
            "analysis_label": "Octant-exposure Incidence PheDAS",
            "comparison": "Named octant versus the pooled other seven",
            "estimator": "Tie-aware Aalen-Johansen cumulative incidence with death competing",
            "hazard_model": "Adjusted M4 ridge cause-specific Cox model",
            "curve_note": "Curves are unadjusted; adjusted M4 hazard ratios come from a separate model. Curve separation is descriptive, not adjusted or causal.",
            "time_horizon_years": 3,
            "risk_table_times_years": [0, 1, 2, 3],
            "scope": {
                "panel_count": 168,
                "outcome_count": 21,
                "phecode_panels": 120,
                "system_panels": 48,
                "fdr_panels": 31,
                "bonferroni_panels": 21,
                "curve_panels_available": 168 - withheld,
                "curve_panels_withheld": withheld,
            },
            "testing": {
                "gate": "All eight octants are shown for each outcome whose 7-df M4 omnibus test reached nominal p < 0.05.",
                "bonferroni": "Within each focal-octant contrast, PheCode tests are corrected across 15 gated outcomes (p < 0.05/15) and system tests across 6 (p < 0.05/6), not across 168 panels.",
                "fdr": "BH q-values were reconstructed within the original contrast-and-model families and retained only after q <= 0.05 reproduced every stored FDR flag.",
            },
            "model": {
                "label": "M4",
                "penalizer": 0.01,
                "covariates": manifest["model_m4"]["covariates"],
                "cpap_note": manifest["model_m4"]["not_adjusted"],
                "ph_note": "Proportional-hazards diagnostics were not computed for the octant models; ph_p is unavailable for every panel. A blank value is not evidence that the assumption was met.",
            },
            "tail_warning": "Mean follow-up is 1.42 years, and only 8.7% of the pooled baseline risk set remains under observation at 3 years. Read the at-risk table before quoting a 3-year cumulative incidence.",
            "disclosure": {
                "threshold": DISCLOSURE_THRESHOLD,
                "rule": "Exact counts below 11 are null and displayed as Suppressed (<11), never as zero.",
                "curve_rule": "Curve coordinates are withheld for the 16 panels whose focal event count is suppressed. Their model metadata remain searchable.",
                "manifest_correction": "The source manifest states that every curve group exceeds 1,000 people; the audited minimum baseline group is 599. The site applies the stricter panel-level withholding rule.",
            },
            "levels": levels,
        },
        "caveats": [
            {
                "title": "Continuous gradients",
                "text": "The physiology, symptom, and comorbidity octants are regions of continuous gradients, not discovered biological subpopulations.",
            },
            {
                "title": "Coverage varies",
                "text": "Measures use their available aggregate denominators. Follow-up and encounter metrics cover the 25,380-person IncWAS spine; age, BMI, and sex cover 53,012 people; several symptom scales are incomplete.",
            },
            {
                "title": "Adjusted associations",
                "text": "Octants are strongly structured by age and sex. M4 models adjust for both, but unadjusted cluster and curve comparisons are neither causal nor clinical treatment effects.",
            },
            {
                "title": "CPAP summaries unavailable",
                "text": "CPAP initiation and adherence distributions are not shown because missing capture cannot be distinguished from never-started and mean-usage units are unconfirmed; no defensible denominator is available.",
            },
            {
                "title": "Race/ethnicity withheld",
                "text": "Race/ethnicity is included in M4 adjustment, but no octant breakdown is published because one cell falls below the disclosure threshold and the breakdown is not approved for release.",
            },
            {
                "title": "Sparse-data and PH checks",
                "text": "Eighty of 168 panels are flagged EPV < 10. Proportional-hazards diagnostics were not computed, so unflagged panels should not be labeled stable.",
            },
        ],
        "sources": [
            {
                "file_name": file_name,
                "role": "aggregate website export",
                "sha256": inventory[file_name]["sha256"],
            }
            for file_name in PUBLIC_EXPORT_FILES
        ],
    }
    reject_path_leaks(payload)
    for asset in curve_assets.values():
        reject_path_leaks(asset["payload"], "curve payload")
    return payload, curve_assets


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            handle.write("\n")
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def write_outputs(payload: dict[str, Any], curve_assets: dict[tuple[str, str], dict[str, Any]]) -> None:
    write_json(OUTPUT_DATA, payload)
    expected_paths: set[Path] = set()
    for asset in curve_assets.values():
        relative = Path(asset["relative_path"])
        destination = WEBSITE_ROOT / "public" / relative
        resolved = destination.resolve()
        if not resolved.is_relative_to(OUTPUT_CURVES.resolve()):
            raise ExportValidationError("curve asset escaped the generated output directory")
        write_json(destination, asset["payload"])
        expected_paths.add(resolved)
    if OUTPUT_CURVES.exists():
        for existing in OUTPUT_CURVES.rglob("*.json"):
            if existing.resolve() not in expected_paths:
                existing.unlink()

    OUTPUT_IMAGES.mkdir(parents=True, exist_ok=True)
    for source, root, output_name, _ in IMAGE_SOURCES.values():
        shutil.copyfile(allowlisted_path(source, root, output_name), OUTPUT_IMAGES / output_name)


def main() -> int:
    payload, curve_assets = build()
    write_outputs(payload, curve_assets)
    print(
        json.dumps(
            {
                "output": "public/data/phenotypes.json",
                "octants": len(payload["octants"]),
                "cluster_metrics": len(payload["cluster_profiles"]["metrics"]),
                "survival_panels": payload["survival"]["scope"]["panel_count"],
                "interactive_curve_panels": payload["survival"]["scope"]["curve_panels_available"],
                "withheld_curve_panels": payload["survival"]["scope"]["curve_panels_withheld"],
                "curve_assets": len(curve_assets),
            },
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
