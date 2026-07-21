#!/usr/bin/env python3
"""Export the two approved aggregate PheDAS result files as compact JSON.

Source paths are intentionally fixed: this script has no option that can point
at patient-, event-, or cohort-level data. Schema drift and unexpected QC values
fail before any website files are written.
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
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
EXPORTER_VERSION = "1.0.0"
DEFAULT_RELEASE = "2026-07-21"
DEFAULTS = {
    "analysis": "prevalence",
    "model": "M4",
    "contrast": "severe_vs_none",
}
MODELS = ("M1", "M2", "M3", "M4")

WEBSITE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WEBSITE_ROOT.parent
OUTPUT_ROOT = WEBSITE_ROOT / "public" / "data"

COMMON_OUTPUTS = (
    "feature_id",
    "feature_name",
    "category",
    "effect_type",
    "effect",
    "ci_low",
    "ci_high",
    "p",
    "neglog10p",
    "sig_fdr",
    "sig_bon",
    "unstable",
)
OUTPUTS = {
    "prevalence": COMMON_OUTPUTS + ("beta", "se"),
    "incidence": COMMON_OUTPUTS
    + ("se", "n_atrisk", "n_events", "ph_p", "unstable_reason"),
}
FEATURE_OUTPUTS = (
    "feature_id",
    "feature_name",
    "category",
    "prevalence",
    "incidence",
    "alternate_names",
)

SOURCES = {
    "prevalence": {
        "source_id": "phedas-prevalence-aggregate-v1",
        "label": "Prevalence PheDAS aggregate association results",
        "path": PROJECT_ROOT
        / "results"
        / "archived results"
        / "icd_analysis_v2_results"
        / "summary"
        / "phewas_results_combined.csv",
        "columns": {
            "contrast",
            "model",
            "PheWAS Code",
            "PheWAS Name",
            "category_string",
            "note",
            "beta",
            "std_error",
            "OR",
            "OR_low",
            "OR_high",
            "p-val",
            "neglog10p",
            "sig_bon",
            "sig_fdr",
            "unstable",
            "ICD-9",
            "ICD-10",
        },
        "models": {
            "m1_crude": "M1",
            "m2_demo": "M2",
            "m3_smk_ses_win": "M3",
            "m4_bmi": "M4",
        },
        "contrasts": (
            "ahi_ge5",
            "ahi_ge15",
            "mild_vs_none",
            "moderate_vs_none",
            "severe_vs_none",
        ),
        "code": "PheWAS Code",
        "name": "PheWAS Name",
        "category": "category_string",
        "effect_type": "OR",
    },
    "incidence": {
        "source_id": "phedas-incidence-aggregate-v1",
        "label": "Incidence PheDAS aggregate association results",
        "path": PROJECT_ROOT
        / "results"
        / "incwas_results"
        / "summary"
        / "cox_results_combined.csv",
        "columns": {
            "phecode",
            "phenotype",
            "category",
            "contrast",
            "model",
            "n_atrisk",
            "n_events",
            "effect_type",
            "effect",
            "se",
            "ci_low",
            "ci_high",
            "p",
            "neglog10p",
            "ph_p",
            "sig_bon",
            "sig_fdr",
            "unstable",
        },
        "models": {"m1": "M1", "m2": "M2", "m3": "M3", "m4": "M4"},
        "contrasts": (
            "omnibus",
            "mild_vs_none",
            "moderate_vs_none",
            "severe_vs_none",
            "trend",
            "ahi_ge5",
            "ahi_ge15",
        ),
        "code": "phecode",
        "name": "phenotype",
        "category": "category",
        "effect_type": "HR",
    },
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


class ExportValidationError(RuntimeError):
    pass


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
        field
        for field in fields
        if header_tokens(field) & BLOCKED_HEADER_TOKENS
        or "id" in header_tokens(field)
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


def raw(row: dict[str, str | None], key: str, context: str) -> str:
    value = row.get(key)
    if value is None:
        raise ExportValidationError(f"{context}: missing {key!r}")
    if value != value.strip():
        raise ExportValidationError(f"{context}: padded value in {key!r}")
    return value


def text(row: dict[str, str | None], key: str, context: str) -> str:
    value = raw(row, key, context)
    if not value:
        raise ExportValidationError(f"{context}: empty {key!r}")
    return value


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


def flag(row: dict[str, str | None], key: str, context: str) -> bool | None:
    value = raw(row, key, context).casefold()
    if value == "":
        return None
    if value == "true":
        return True
    if value == "false":
        return False
    raise ExportValidationError(f"{context}: invalid Boolean {key!r}")


def prevalence_record(
    row: dict[str, str | None], feature: tuple[str, str, str], context: str
) -> dict[str, Any]:
    feature_id, feature_name, category = feature
    return {
        "feature_id": feature_id,
        "feature_name": feature_name,
        "category": category,
        "effect_type": "OR",
        "effect": number(row, "OR", context),
        "ci_low": number(row, "OR_low", context),
        "ci_high": number(row, "OR_high", context),
        "p": number(row, "p-val", context),
        "neglog10p": number(row, "neglog10p", context),
        "sig_fdr": flag(row, "sig_fdr", context),
        "sig_bon": flag(row, "sig_bon", context),
        "unstable": flag(row, "unstable", context),
        "beta": number(row, "beta", context),
        "se": number(row, "std_error", context),
    }


def incidence_record(
    row: dict[str, str | None], feature: tuple[str, str, str], context: str
) -> dict[str, Any]:
    feature_id, feature_name, category = feature
    effect_type = text(row, "effect_type", context)
    if effect_type != "HR":
        raise ExportValidationError(f"{context}: unsupported effect type")
    unstable_code = raw(row, "unstable", context)
    if unstable_code not in {"", "epv<10"}:
        raise ExportValidationError(f"{context}: unsupported unstable reason")
    return {
        "feature_id": feature_id,
        "feature_name": feature_name,
        "category": category,
        "effect_type": effect_type,
        "effect": number(row, "effect", context),
        "ci_low": number(row, "ci_low", context),
        "ci_high": number(row, "ci_high", context),
        "p": number(row, "p", context),
        "neglog10p": number(row, "neglog10p", context),
        "sig_fdr": flag(row, "sig_fdr", context),
        "sig_bon": flag(row, "sig_bon", context),
        "unstable": unstable_code != "",
        "se": number(row, "se", context),
        "n_atrisk": number(row, "n_atrisk", context, integer=True),
        "n_events": number(row, "n_events", context, integer=True),
        "ph_p": number(row, "ph_p", context),
        "unstable_reason": unstable_code or None,
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load() -> tuple[
    dict[tuple[str, str, str], list[dict[str, Any]]],
    dict[tuple[str, str], tuple[str, str]],
    list[dict[str, Any]],
]:
    partitions: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    features: dict[tuple[str, str], tuple[str, str]] = {}
    source_metadata = []

    for analysis, spec in SOURCES.items():
        path = spec["path"].resolve(strict=True)
        source_id = spec["source_id"]
        seen: set[tuple[str, str, str]] = set()
        row_count = 0
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            validate_header(source_id, spec["columns"], reader.fieldnames)
            for row_number, row in enumerate(reader, start=2):
                context = f"{source_id} row {row_number}"
                if None in row:
                    raise ExportValidationError(f"{context}: extra CSV fields")
                row_count += 1
                raw_model = text(row, "model", context)
                if raw_model not in spec["models"]:
                    raise ExportValidationError(f"{context}: unsupported model")
                model = spec["models"][raw_model]
                contrast = text(row, "contrast", context)
                if contrast not in spec["contrasts"]:
                    raise ExportValidationError(f"{context}: unsupported contrast")
                feature = (
                    text(row, spec["code"], context),
                    text(row, spec["name"], context),
                    text(row, spec["category"], context),
                )

                association_key = (model, contrast, feature[0])
                if association_key in seen:
                    raise ExportValidationError(f"{context}: duplicate association")
                seen.add(association_key)

                feature_key = (analysis, feature[0])
                feature_metadata = feature[1:]
                if feature_key in features and features[feature_key] != feature_metadata:
                    raise ExportValidationError(f"{context}: inconsistent feature metadata")
                features[feature_key] = feature_metadata

                record = (
                    prevalence_record(row, feature, context)
                    if analysis == "prevalence"
                    else incidence_record(row, feature, context)
                )
                partitions[(analysis, model, contrast)].append(record)

        expected = {
            (analysis, model, contrast)
            for model in MODELS
            for contrast in spec["contrasts"]
        }
        if not expected.issubset(partitions):
            raise ExportValidationError(f"{source_id}: missing model/contrast partition")
        source_metadata.append(
            {
                "source_id": source_id,
                "analysis": analysis,
                "label": spec["label"],
                "file_name": path.name,
                "effect_type": spec["effect_type"],
                "row_count": row_count,
                "sha256": sha256(path),
            }
        )
    return partitions, features, source_metadata


def aligned_columns(
    records: list[dict[str, Any]], expected: tuple[str, ...], context: str
) -> dict[str, list[Any]]:
    expected_set = set(expected)
    if any(set(record) != expected_set for record in records):
        raise ExportValidationError(f"{context}: output schema mismatch")
    columns = {key: [record[key] for record in records] for key in expected}
    if {len(values) for values in columns.values()} != {len(records)}:
        raise ExportValidationError(f"{context}: unaligned output columns")
    return columns


def feature_payload(
    features: dict[tuple[str, str], tuple[str, str]], release_id: str
) -> dict[str, Any]:
    feature_ids = {feature_id for _, feature_id in features}

    def preferred(feature_id: str) -> tuple[str, str]:
        return features.get(("prevalence", feature_id)) or features[
            ("incidence", feature_id)
        ]

    records = []
    for feature_id in sorted(
        feature_ids, key=lambda value: (preferred(value)[0].casefold(), value)
    ):
        prevalence = features.get(("prevalence", feature_id))
        incidence = features.get(("incidence", feature_id))
        feature_name, category = preferred(feature_id)
        names = {item[0] for item in (prevalence, incidence) if item is not None}
        records.append(
            {
                "feature_id": feature_id,
                "feature_name": feature_name,
                "category": category,
                "prevalence": prevalence is not None,
                "incidence": incidence is not None,
                "alternate_names": sorted(names - {feature_name}),
            }
        )
    return {
        "schema_version": SCHEMA_VERSION,
        "metadata": {
            "dataset": "phedas-feature-index",
            "release_id": release_id,
            "row_count": len(records),
            "preferred_metadata_source": "prevalence_then_incidence",
        },
        "columns": aligned_columns(records, FEATURE_OUTPUTS, "features"),
    }


def partition_path(analysis: str, model: str, contrast: str) -> str:
    return f"phedas/{analysis}/{model.casefold()}/{contrast}.json"


def build(release_id: str) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    partitions, features, sources = load()
    outputs = {"features.json": feature_payload(features, release_id)}
    manifest_partitions = []
    source_by_analysis = {source["analysis"]: source for source in sources}
    analysis_rank = {analysis: rank for rank, analysis in enumerate(SOURCES)}

    ordered_keys = sorted(
        partitions,
        key=lambda key: (
            analysis_rank[key[0]],
            MODELS.index(key[1]),
            SOURCES[key[0]]["contrasts"].index(key[2]),
        ),
    )
    for analysis, model, contrast in ordered_keys:
        records = partitions[(analysis, model, contrast)]
        path = partition_path(analysis, model, contrast)
        effect_type = source_by_analysis[analysis]["effect_type"]
        outputs[path] = {
            "schema_version": SCHEMA_VERSION,
            "metadata": {
                "analysis": analysis,
                "model": model,
                "contrast": contrast,
                "effect_type": effect_type,
                "release_id": release_id,
                "source_id": source_by_analysis[analysis]["source_id"],
                "row_count": len(records),
            },
            "columns": aligned_columns(records, OUTPUTS[analysis], path),
        }
        manifest_partitions.append(
            {
                "analysis": analysis,
                "model": model,
                "contrast": contrast,
                "effect_type": effect_type,
                "row_count": len(records),
                "path": path,
            }
        )

    default_path = partition_path(**DEFAULTS)
    if default_path not in outputs or not outputs[default_path]["metadata"]["row_count"]:
        raise ExportValidationError("default partition is missing or empty")
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "exporter_version": EXPORTER_VERSION,
        "release": {
            "id": release_id,
            "audience": "researchers",
            "scope": "OSA disease-wide association results",
        },
        "defaults": {**DEFAULTS, "partition_path": default_path},
        "models": list(MODELS),
        "features": {
            "path": "features.json",
            "row_count": outputs["features.json"]["metadata"]["row_count"],
        },
        "sources": sources,
        "partitions": manifest_partitions,
    }
    outputs["atlas-manifest.json"] = manifest
    return outputs, manifest


def reject_absolute_paths(value: Any, context: str = "payload") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            reject_absolute_paths(child, f"{context}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            reject_absolute_paths(child, f"{context}[{index}]")
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
    outputs, manifest = build(release_id)
    for path, payload in outputs.items():
        reject_absolute_paths(payload)
        write_json(path, payload)
    print(
        json.dumps(
            {
                "output_root": "public/data",
                "files_written": len(outputs),
                "feature_count": manifest["features"]["row_count"],
                "partition_count": len(manifest["partitions"]),
                "source_rows": {
                    source["analysis"]: source["row_count"]
                    for source in manifest["sources"]
                },
                "default_partition": manifest["defaults"]["partition_path"],
            },
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
