#!/usr/bin/env python3
"""Publish the owner-approved, aggregate-only QWAS association explorer data."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
DISCLOSURE_THRESHOLD = 11
WINDOW = "index"
MODELS = ("m1", "m2", "m3", "m4")
CONTRASTS = (
    "omnibus",
    "trend",
    "mild_vs_none",
    "moderate_vs_none",
    "severe_vs_none",
    "ahi_ge5",
    "ahi_ge15",
)
ANALYSES = {
    "binary": {
        "analysis_id": "qwas_binary",
        "label": "Binary questionnaire response",
        "feature_count": 83,
        "directional_effect": "OR",
        "omnibus_effect": "wald_chi2",
        "directional_scale": "odds ratio",
        "omnibus_scale": "Wald chi-square statistic",
    },
    "continuous": {
        "analysis_id": "qwas_continuous",
        "label": "Ordinal or continuous questionnaire response",
        "feature_count": 49,
        "directional_effect": "beta",
        "omnibus_effect": "wald_F",
        "directional_scale": "rank-inverse-normal standard-deviation beta",
        "omnibus_scale": "Wald F statistic",
    },
}
RESULT_COLUMNS = (
    "feature",
    "domain",
    "form",
    "referral_item",
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
)
SPEC_COLUMNS = (
    "feature",
    "domain",
    "family",
    "forms",
    "cut_op",
    "cut_val",
    "n_answered",
    "n_positive",
    "referral_item",
)
PARTITION_COLUMNS = (
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
    "referral_item",
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

WEBSITE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WEBSITE_ROOT.parent
SOURCE_ROOT = PROJECT_ROOT / "results" / "qwas_results"
RESULTS_CSV = SOURCE_ROOT / "analysis" / "results.csv"
SPEC_CSV = SOURCE_ROOT / "targets" / "feature_spec.csv"
APPROVAL_JSON = Path(__file__).with_name("qwas_release_approval.json")
OUTPUT_ROOT = WEBSITE_ROOT / "public" / "data"
WAS_ROOT = OUTPUT_ROOT / "was"
WAS_MANIFEST = OUTPUT_ROOT / "was-manifest.json"
WAS_FEATURES = OUTPUT_ROOT / "was-features.json"

RELEASE_NOTE = (
    "Owner-approved aggregate research preview. QWAS is cross-sectional and uses the closest "
    "questionnaire on or before the sleep-study index. Models are itemwise complete-case; the "
    "displayed answered N may exceed the fitted N when adjustment covariates are missing. FDR and "
    "Bonferroni flags preserve source correction families defined within contrast, model, and effect "
    "type. Referral-driving items are flagged because ascertainment may contribute to associations."
)
QC_WARNINGS = [
    "Only 74,061 patients with a usable pre-index questionnaire were eligible; no selection weighting was used.",
    "Item nonresponse is treated as unknown and each feature is analyzed complete-case.",
    "The displayed answered N is the sample supplied to the source formula, not a model-specific fitted N after covariate missingness.",
    "No separation, influence, robust-standard-error, or events-per-variable instability screen was supplied.",
    "STOP1, STOP3, GASP, and CC_SNORING_APNEA can help drive referral and are marked as ascertainment-sensitive.",
]

CONCEPT_LABELS = {
    "GASP": "Nocturnal gasping or shortness of breath",
    "SLEEPY": "Excessive daytime sleepiness",
    "DROWSYDRIVING": "Drowsiness while driving",
    "CLAUST": "Claustrophobia or confined-space anxiety",
    "MEDS": "Sleep-aid medication use",
    "PARTNER": "Sleeping with another person in the room",
    "PARASOMNIA": "Unusual movements or behaviors during sleep",
    "SLEEPATTACK": "Sudden sleep attacks",
    "SLEEPHALLUCINATION": "Sleep-related hallucinations",
    "CATAPLEXY": "Cataplexy symptoms",
    "PTSD": "Post-traumatic stress disorder",
    "SHIFT": "Night, rotating, or variable shift work",
    "LATENCY": "Sleep latency",
    "SVS1": "Weekly sleep dissatisfaction",
    "SVS2": "Weekly problematic sleepiness",
    "NAPS": "Weekly daytime naps",
    "HEADACHE": "Weekly morning headaches",
    "AWAKENINGS": "Nighttime awakenings",
    "CAFFEINE": "Daily caffeinated drinks",
    "STOP1": "STOP screening: snoring",
    "STOP2": "STOP screening: daytime tiredness",
    "STOP3": "STOP screening: observed apnea",
    "STOP4": "STOP screening: hypertension",
    "SLEEPTIME": "Nightly sleep duration",
    "SLEEPPARALYSIS": "Sleep paralysis",
    "ESS_TOTAL": "Epworth Sleepiness Scale total",
    "ISI_TOTAL": "Insomnia Severity Index total",
    "PHQ2_TOTAL": "PHQ-2 total",
    "FOSQ_MEAN": "Functional Outcomes of Sleep Questionnaire mean",
}
CHIEF_COMPLAINT_LABELS = {
    "SNORING_APNEA": "Snoring or apnea",
    "INSOMNIA": "Insomnia",
    "SLEEPINESS": "Sleepiness",
    "FATIGUE": "Fatigue",
    "RESTLESS_LEGS": "Restless legs",
    "PARASOMNIA": "Parasomnia",
    "HEADACHE": "Headache",
    "DRY_MOUTH": "Dry mouth",
    "NOCTURIA": "Nocturia",
    "REFERRAL": "Referral or evaluation",
    "OTHER": "Other",
}


class QwasValidationError(ValueError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_bool(value: str, field: str, context: str) -> bool:
    normalized = value.strip().lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise QwasValidationError(f"{context}: invalid {field}")


def parse_float(value: str, field: str, context: str, *, required: bool) -> float | None:
    if value.strip() == "":
        if required:
            raise QwasValidationError(f"{context}: missing {field}")
        return None
    try:
        parsed = float(value)
    except ValueError as exc:
        raise QwasValidationError(f"{context}: invalid {field}") from exc
    if not math.isfinite(parsed):
        raise QwasValidationError(f"{context}: non-finite {field}")
    return parsed


def read_csv(path: Path, expected_columns: tuple[str, ...]) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != expected_columns:
            raise QwasValidationError(f"{path.name}: schema changed")
        return list(reader)


def display_label(feature: str) -> str:
    if feature in CONCEPT_LABELS:
        return CONCEPT_LABELS[feature]
    instrument = re.fullmatch(r"(ESS|ISI|PHQ|FOSQ|RLS)(\d+)", feature)
    if instrument:
        names = {
            "ESS": "Epworth Sleepiness Scale",
            "ISI": "Insomnia Severity Index",
            "PHQ": "PHQ-2",
            "FOSQ": "Functional Outcomes of Sleep Questionnaire",
            "RLS": "Restless legs screening",
        }
        return f"{names[instrument.group(1)]} item {instrument.group(2)}"
    complaint = re.fullmatch(r"CC_(.+)", feature)
    if complaint:
        concept = CHIEF_COMPLAINT_LABELS.get(
            complaint.group(1), complaint.group(1).replace("_", " ").title()
        )
        return f"Chief complaint: {concept}"
    time_bin = re.fullmatch(r"(BEDTIME|WAKETIME)_(\d{4})_(\d{4})", feature)
    if time_bin:
        prefix = "Bedtime" if time_bin.group(1) == "BEDTIME" else "Wake time"
        return f"{prefix}: {clock_label(time_bin.group(2))}–{clock_label(time_bin.group(3))}"
    return feature.replace("_", " ").title()


def clock_label(hhmm: str) -> str:
    hour = int(hhmm[:2])
    minute = hhmm[2:]
    suffix = "AM" if hour < 12 else "PM"
    display_hour = hour % 12 or 12
    return f"{display_hour}:{minute} {suffix}"


def label_review_required(feature: str) -> bool:
    return re.fullmatch(r"(ESS|ISI|PHQ|FOSQ|RLS)\d+", feature) is not None


def alternate_names(feature: str, label: str) -> list[str]:
    values = [feature.replace("_", " ")]
    prefix = re.match(r"(ESS|ISI|PHQ|FOSQ|RLS)", feature)
    if prefix:
        values.extend(
            {
                "ESS": ["Epworth", "Epworth Sleepiness Scale"],
                "ISI": ["Insomnia Severity Index"],
                "PHQ": ["Patient Health Questionnaire", "depression"],
                "FOSQ": ["Functional Outcomes of Sleep Questionnaire", "sleep-related function"],
                "RLS": ["restless legs", "restless legs syndrome"],
            }[prefix.group(1)]
        )
    if feature.startswith("STOP"):
        values.extend(["STOP", "STOP-Bang"])
    if feature.startswith("CC_"):
        values.append(label.removeprefix("Chief complaint: "))
    return sorted({value for value in values if value and value.lower() != label.lower()})


def load_approval() -> dict[str, Any]:
    approval = json.loads(APPROVAL_JSON.read_text(encoding="utf-8"))
    if approval.get("schema_version") != SCHEMA_VERSION:
        raise QwasValidationError("approval schema version changed")
    if approval.get("release_approved") is not True:
        raise QwasValidationError("QWAS release is not approved")
    if approval.get("public_website_release_approved") is not True:
        raise QwasValidationError("QWAS public website release is not approved")
    if approval.get("disclosure_threshold") != DISCLOSURE_THRESHOLD:
        raise QwasValidationError("QWAS disclosure threshold changed")
    expected_hashes = approval.get("source_sha256")
    if not isinstance(expected_hashes, dict):
        raise QwasValidationError("approval source hashes are missing")
    observed = {
        "results.csv": sha256(RESULTS_CSV),
        "feature_spec.csv": sha256(SPEC_CSV),
    }
    if expected_hashes != observed:
        raise QwasValidationError("approved QWAS source hashes do not match")
    return approval


def load_spec() -> dict[str, dict[str, Any]]:
    rows = read_csv(SPEC_CSV, SPEC_COLUMNS)
    if len(rows) != 92:
        raise QwasValidationError(f"feature_spec.csv has {len(rows)} rows; expected 92")
    specs: dict[str, dict[str, Any]] = {}
    form_counts: Counter[str] = Counter()
    referral_features: set[str] = set()
    for index, raw in enumerate(rows, start=2):
        context = f"feature_spec.csv row {index}"
        feature = raw["feature"].strip()
        domain = raw["domain"].strip()
        forms = raw["forms"].strip()
        if not feature or not domain or forms not in {"binary", "continuous", "both"}:
            raise QwasValidationError(f"{context}: invalid feature metadata")
        if feature in specs:
            raise QwasValidationError(f"{context}: duplicate feature")
        try:
            n_answered = int(raw["n_answered"])
        except ValueError as exc:
            raise QwasValidationError(f"{context}: invalid n_answered") from exc
        if n_answered < DISCLOSURE_THRESHOLD:
            raise QwasValidationError(f"{context}: answered N below disclosure threshold")
        referral = parse_bool(raw["referral_item"], "referral_item", context)
        available_forms = (
            {"binary", "continuous"} if forms == "both" else {forms}
        )
        for form in available_forms:
            form_counts[form] += 1
        if referral:
            referral_features.add(feature)
        specs[feature] = {
            "feature": feature,
            "domain": domain,
            "forms": available_forms,
            "n_answered": n_answered,
            "referral_item": referral,
            "feature_name": display_label(feature),
            "label_review_required": label_review_required(feature),
        }
    if form_counts != Counter({"binary": 83, "continuous": 49}):
        raise QwasValidationError(f"unexpected feature-form counts: {dict(form_counts)}")
    if referral_features != {"GASP", "STOP1", "STOP3", "CC_SNORING_APNEA"}:
        raise QwasValidationError("referral-item set changed")
    return specs


def load_results(specs: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    raw_rows = read_csv(RESULTS_CSV, RESULT_COLUMNS)
    if len(raw_rows) != 4620:
        raise QwasValidationError(f"results.csv has {len(raw_rows)} rows; expected 4,620")
    output: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str]] = set()
    for index, raw in enumerate(raw_rows, start=2):
        if raw["model"] == "unadjusted":
            continue
        context = f"results.csv row {index}"
        feature = raw["feature"].strip()
        form = raw["form"].strip()
        model = raw["model"].strip()
        contrast = raw["contrast"].strip()
        if feature not in specs or form not in ANALYSES:
            raise QwasValidationError(f"{context}: unsupported feature or form")
        if form not in specs[feature]["forms"]:
            raise QwasValidationError(f"{context}: form disagrees with feature specification")
        if model not in MODELS or contrast not in CONTRASTS:
            raise QwasValidationError(f"{context}: unsupported model or contrast")
        if raw["domain"].strip() != specs[feature]["domain"]:
            raise QwasValidationError(f"{context}: domain disagrees with feature specification")
        referral = parse_bool(raw["referral_item"], "referral_item", context)
        if referral != specs[feature]["referral_item"]:
            raise QwasValidationError(f"{context}: referral flag disagrees with feature specification")
        key = (feature, form, model, contrast)
        if key in seen:
            raise QwasValidationError(f"{context}: duplicate result key")
        seen.add(key)

        expected_effect = ANALYSES[form][
            "omnibus_effect" if contrast == "omnibus" else "directional_effect"
        ]
        effect_type = raw["effect_type"].strip()
        if effect_type != expected_effect:
            raise QwasValidationError(f"{context}: unexpected effect type {effect_type}")
        try:
            n = int(raw["n"])
        except ValueError as exc:
            raise QwasValidationError(f"{context}: invalid n") from exc
        if n < DISCLOSURE_THRESHOLD:
            raise QwasValidationError(f"{context}: analytic N below disclosure threshold")

        effect = parse_float(raw["effect"], "effect", context, required=True)
        p = parse_float(raw["p"], "p", context, required=True)
        if p is None or p < 0 or p > 1:
            raise QwasValidationError(f"{context}: p outside [0, 1]")
        directional = contrast != "omnibus"
        se = parse_float(raw["se"], "se", context, required=directional)
        ci_low = parse_float(raw["ci_low"], "ci_low", context, required=directional)
        ci_high = parse_float(raw["ci_high"], "ci_high", context, required=directional)
        if directional and ci_low is not None and ci_high is not None and ci_low > ci_high:
            raise QwasValidationError(f"{context}: inverted confidence interval")
        stored_strength = parse_float(
            raw["neglog10p"], "neglog10p", context, required=False
        )
        if p == 0:
            neglog10p = 300.0
        else:
            neglog10p = min(300.0, stored_strength if stored_strength is not None else -math.log10(p))

        unstable_reason = raw["unstable"].strip() or None
        output.append(
            {
                "feature_key": f"qwas:{feature}",
                "feature_id": feature,
                "feature_name": specs[feature]["feature_name"],
                "category": specs[feature]["domain"],
                "subgroup": "Referral-pathway item" if referral else "",
                "effect_type": effect_type,
                "effect": effect,
                "se": se,
                "ci_low": ci_low,
                "ci_high": ci_high,
                "p": p,
                "neglog10p": neglog10p,
                "sig_fdr": parse_bool(raw["sig_fdr"], "sig_fdr", context),
                "sig_bon": parse_bool(raw["sig_bon"], "sig_bon", context),
                "unstable": unstable_reason is not None,
                "unstable_reason": unstable_reason,
                "n": n,
                "n_secondary": None,
                "prevalence": None,
                "label_review_required": specs[feature]["label_review_required"],
                "referral_item": referral,
                "_form": form,
                "_model": model,
                "_contrast": contrast,
            }
        )
    if len(output) != 3696:
        raise QwasValidationError(f"adjusted results contain {len(output)} rows; expected 3,696")
    return output


def aligned_columns(rows: list[dict[str, Any]], fields: tuple[str, ...]) -> dict[str, list[Any]]:
    return {field: [row.get(field) for row in rows] for field in fields}


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


def partition_metadata(form: str, model: str, contrast: str, row_count: int) -> dict[str, Any]:
    analysis = ANALYSES[form]
    omnibus = contrast == "omnibus"
    return {
        "analysis_id": analysis["analysis_id"],
        "family": "qwas",
        "label": analysis["label"],
        "window": WINDOW,
        "model": model.upper(),
        "contrast": contrast,
        "effect_type": analysis["omnibus_effect" if omnibus else "directional_effect"],
        "effect_scale": analysis["omnibus_scale" if omnibus else "directional_scale"],
        "neutral_value": 0 if omnibus or form == "continuous" else 1,
        "directional": not omnibus,
        "code_system": "Questionnaire item",
        "row_count": row_count,
        "release_status": "research_preview",
        "release_note": RELEASE_NOTE,
        "sample_n_label": "Answered N supplied to source model",
        "secondary_n_label": "",
        "qc_warnings": QC_WARNINGS,
    }


def write_partitions(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(row["_form"], row["_model"], row["_contrast"])].append(row)
    expected_keys = {
        (form, model, contrast)
        for form in ANALYSES
        for model in MODELS
        for contrast in CONTRASTS
    }
    if set(grouped) != expected_keys:
        raise QwasValidationError("adjusted results do not form the required 2 x 4 x 7 grid")

    refs: list[dict[str, Any]] = []
    for form in ANALYSES:
        analysis = ANALYSES[form]
        for model in MODELS:
            for contrast in CONTRASTS:
                partition_rows = sorted(
                    grouped[(form, model, contrast)],
                    key=lambda row: (row["category"], row["feature_name"], row["feature_id"]),
                )
                if len(partition_rows) != analysis["feature_count"]:
                    raise QwasValidationError(
                        f"{analysis['analysis_id']}/{model}/{contrast} has {len(partition_rows)} rows"
                    )
                metadata = partition_metadata(form, model, contrast, len(partition_rows))
                relative = (
                    Path("was")
                    / analysis["analysis_id"]
                    / WINDOW
                    / model
                    / f"{contrast}.json"
                )
                write_json(
                    OUTPUT_ROOT / relative,
                    {
                        "schema_version": SCHEMA_VERSION,
                        "metadata": metadata,
                        "columns": aligned_columns(partition_rows, PARTITION_COLUMNS),
                    },
                )
                refs.append({"path": relative.as_posix(), **metadata})
    return refs


def update_registry(specs: dict[str, dict[str, Any]]) -> None:
    payload = json.loads(WAS_FEATURES.read_text(encoding="utf-8"))
    columns = payload.get("columns")
    if not isinstance(columns, dict) or tuple(columns) != REGISTRY_COLUMNS:
        raise QwasValidationError("existing WAS feature registry schema changed")
    lengths = {len(values) for values in columns.values() if isinstance(values, list)}
    if len(lengths) != 1 or any(not isinstance(values, list) for values in columns.values()):
        raise QwasValidationError("existing WAS feature registry columns are not aligned")
    old_count = lengths.pop()
    existing = [
        {field: columns[field][index] for field in REGISTRY_COLUMNS}
        for index in range(old_count)
        if columns["family"][index] != "qwas"
    ]
    qwas_rows: list[dict[str, Any]] = []
    for spec in specs.values():
        analysis_ids = [
            ANALYSES[form]["analysis_id"]
            for form in ("binary", "continuous")
            if form in spec["forms"]
        ]
        qwas_rows.append(
            {
                "feature_key": f"qwas:{spec['feature']}",
                "feature_id": spec["feature"],
                "feature_name": spec["feature_name"],
                "family": "qwas",
                "analysis_ids": analysis_ids,
                "category": spec["domain"],
                "subgroup": "Referral-pathway item" if spec["referral_item"] else "",
                "code_system": "Questionnaire item",
                "alternate_names": alternate_names(spec["feature"], spec["feature_name"]),
                "windows": [WINDOW],
                "label_review_required": spec["label_review_required"],
            }
        )
    all_rows = existing + sorted(
        qwas_rows, key=lambda row: (row["category"], row["feature_name"], row["feature_id"])
    )
    keys = [row["feature_key"] for row in all_rows]
    if len(keys) != len(set(keys)):
        raise QwasValidationError("feature registry contains duplicate feature keys")
    payload["schema_version"] = SCHEMA_VERSION
    metadata = payload.setdefault("metadata", {})
    metadata["row_count"] = len(all_rows)
    payload["columns"] = aligned_columns(all_rows, REGISTRY_COLUMNS)
    write_json(WAS_FEATURES, payload)


def update_manifest(
    refs: list[dict[str, Any]], specs: dict[str, dict[str, Any]], approval: dict[str, Any]
) -> None:
    manifest = json.loads(WAS_MANIFEST.read_text(encoding="utf-8"))
    analyses = manifest.get("analyses")
    partitions = manifest.get("partitions")
    sources = manifest.get("sources")
    if not isinstance(analyses, list) or not isinstance(partitions, list) or not isinstance(sources, list):
        raise QwasValidationError("existing WAS manifest schema changed")
    analyses = [item for item in analyses if item.get("family") != "qwas"]
    for form in ("binary", "continuous"):
        analysis = ANALYSES[form]
        analyses.append(
            {
                "analysis_id": analysis["analysis_id"],
                "family": "qwas",
                "label": analysis["label"],
                "code_system": "Questionnaire item",
                "release_status": "research_preview",
                "release_note": RELEASE_NOTE,
                "windows": [WINDOW],
                "models": [model.upper() for model in MODELS],
                "contrasts": list(CONTRASTS),
                "feature_count": analysis["feature_count"],
                "partition_count": len(MODELS) * len(CONTRASTS),
            }
        )
    manifest["analyses"] = analyses
    manifest["partitions"] = [
        item for item in partitions if item.get("family") != "qwas"
    ] + refs
    manifest["sources"] = [
        item for item in sources if not str(item.get("source_id", "")).startswith("qwas_")
    ] + [
        {
            "source_id": "qwas_results",
            "file_name": "results.csv",
            "row_count": 4620,
            "sha256": sha256(RESULTS_CSV),
        },
        {
            "source_id": "qwas_feature_spec",
            "file_name": "feature_spec.csv",
            "row_count": len(specs),
            "sha256": sha256(SPEC_CSV),
        },
        {
            "source_id": "qwas_release_approval",
            "file_name": APPROVAL_JSON.name,
            "row_count": 1,
            "sha256": sha256(APPROVAL_JSON),
        },
    ]
    release = manifest.setdefault("release", {})
    release["scope"] = (
        "Aggregate OSA LabWAS, MedWAS, BehWAS, ProcWAS, UtilWAS, and QWAS results"
    )
    manifest.setdefault("features", {})["row_count"] = len(
        json.loads(WAS_FEATURES.read_text(encoding="utf-8"))["columns"]["feature_key"]
    )
    manifest["qwas_release"] = {
        "release_status": "owner_approved",
        "release_note": RELEASE_NOTE,
        "release_approved": approval["release_approved"],
        "public_website_release_approved": approval["public_website_release_approved"],
        "analytic_sample_n": 74061,
        "unique_feature_count": len(specs),
        "feature_form_count": 132,
        "provisional_label_count": sum(
            1 for spec in specs.values() if spec["label_review_required"]
        ),
        "referral_item_count": sum(1 for spec in specs.values() if spec["referral_item"]),
    }
    write_json(WAS_MANIFEST, manifest)


def main() -> int:
    for path in (RESULTS_CSV, SPEC_CSV, APPROVAL_JSON, WAS_MANIFEST, WAS_FEATURES):
        if not path.exists():
            raise FileNotFoundError(path)
    approval = load_approval()
    specs = load_spec()
    rows = load_results(specs)
    refs = write_partitions(rows)
    update_registry(specs)
    update_manifest(refs, specs, approval)
    print(
        "Published QWAS: "
        f"{len(specs)} features, {len(rows)} adjusted association rows, {len(refs)} partitions."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
