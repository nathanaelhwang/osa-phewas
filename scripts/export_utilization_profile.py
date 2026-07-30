#!/usr/bin/env python3
"""Publish the approved, aggregate-only UtilWAS utilization profile."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
DISCLOSURE_THRESHOLD = 11
METRIC_IDS = (
    "outpatient_rate",
    "inpatient_rate",
    "hospital_los_days",
    "ed_rate",
    "urgent_care_rate",
    "primary_care_rate",
    "specialty_rate",
)
WINDOWS = ("1yr", "5yr")
SEVERITIES = ("Overall", "None", "Mild", "Moderate", "Severe")
PROFILE_COLUMNS = (
    "metric_id",
    "metric_label",
    "window",
    "severity",
    "n_denominator",
    "n_nonmissing",
    "n_with_use",
    "mean",
    "sd",
    "median",
    "unit",
    "denominator_definition",
    "metric_definition",
    "suppressed",
    "suppression_reason",
)
RATE_METRICS = set(METRIC_IDS) - {"hospital_los_days"}

WEBSITE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WEBSITE_ROOT.parent
SOURCE_ROOT = PROJECT_ROOT / "results" / "utilwas_results" / "website_exports"
SOURCE_CSV = SOURCE_ROOT / "utilwas_utilization_profile.csv"
SOURCE_MANIFEST = SOURCE_ROOT / "utilwas_utilization_profile_manifest.json"
OUTPUT_ROOT = WEBSITE_ROOT / "public" / "data"
OUTPUT_JSON = OUTPUT_ROOT / "was-utilization-profile.json"
WAS_MANIFEST = OUTPUT_ROOT / "was-manifest.json"


class ProfileValidationError(ValueError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def required_text(row: dict[str, str], field: str, context: str) -> str:
    value = row.get(field, "").strip()
    if not value:
        raise ProfileValidationError(f"{context}: missing {field}")
    return value


def parse_integer(value: str, field: str, context: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ProfileValidationError(f"{context}: invalid {field}") from exc
    if parsed < 0:
        raise ProfileValidationError(f"{context}: negative {field}")
    return parsed


def parse_float(value: str, field: str, context: str) -> float | None:
    if value.strip() == "":
        return None
    try:
        parsed = float(value)
    except ValueError as exc:
        raise ProfileValidationError(f"{context}: invalid {field}") from exc
    if not math.isfinite(parsed) or parsed < 0:
        raise ProfileValidationError(f"{context}: invalid {field}")
    return parsed


def parse_bool(value: str, field: str, context: str) -> bool:
    normalized = value.strip().lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise ProfileValidationError(f"{context}: invalid {field}")


def load_source_manifest() -> dict[str, Any]:
    manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("row_count") != 70 or manifest.get("required_row_count") != 70:
        raise ProfileValidationError("source manifest does not describe the required 70-row grid")
    if manifest.get("release_approved") is not True:
        raise ProfileValidationError("source manifest is not release-approved")
    if manifest.get("public_website_release_approved") is not True:
        raise ProfileValidationError("source manifest is not approved for the public website")
    if manifest.get("definition_suppressed_cell_count") != 0:
        raise ProfileValidationError("source manifest still contains definition-gated cells")
    primary = manifest.get("exact_primary_care_specialty_list")
    if not isinstance(primary, list) or not primary or not all(isinstance(item, str) and item for item in primary):
        raise ProfileValidationError("source manifest lacks an approved primary-care specialty list")
    crosswalk_status = manifest.get("primary_care_crosswalk_status")
    if not isinstance(crosswalk_status, str) or not crosswalk_status.startswith("owner_approved"):
        raise ProfileValidationError("source crosswalk is not owner-approved")
    return manifest


def load_rows() -> list[dict[str, Any]]:
    with SOURCE_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != PROFILE_COLUMNS:
            raise ProfileValidationError("source CSV schema changed")
        raw_rows = list(reader)

    if len(raw_rows) != 70:
        raise ProfileValidationError(f"source CSV has {len(raw_rows)} rows; expected 70")

    rows: list[dict[str, Any]] = []
    observed_keys: set[tuple[str, str, str]] = set()
    for index, raw in enumerate(raw_rows, start=2):
        context = f"source row {index}"
        metric_id = required_text(raw, "metric_id", context)
        window = required_text(raw, "window", context)
        severity = required_text(raw, "severity", context)
        if metric_id not in METRIC_IDS or window not in WINDOWS or severity not in SEVERITIES:
            raise ProfileValidationError(f"{context}: unsupported metric/window/severity key")
        key = (metric_id, window, severity)
        if key in observed_keys:
            raise ProfileValidationError(f"{context}: duplicate profile key")
        observed_keys.add(key)

        n_denominator = parse_integer(raw["n_denominator"], "n_denominator", context)
        n_nonmissing = parse_integer(raw["n_nonmissing"], "n_nonmissing", context)
        n_with_use = parse_integer(raw["n_with_use"], "n_with_use", context)
        mean = parse_float(raw["mean"], "mean", context)
        sd = parse_float(raw["sd"], "sd", context)
        median = parse_float(raw["median"], "median", context)
        suppressed = parse_bool(raw["suppressed"], "suppressed", context)
        suppression_reason = raw["suppression_reason"].strip()

        if suppressed:
            if any(value is not None for value in (mean, sd, median)) or not suppression_reason:
                raise ProfileValidationError(f"{context}: invalid suppressed statistics")
        else:
            if any(value is None for value in (mean, sd, median)) or suppression_reason:
                raise ProfileValidationError(f"{context}: incomplete released statistics")
            if min(n_denominator, n_nonmissing, n_with_use) < DISCLOSURE_THRESHOLD:
                raise ProfileValidationError(f"{context}: released supporting count is below threshold")

        if metric_id in RATE_METRICS:
            if raw["unit"] != "encounters/person-year":
                raise ProfileValidationError(f"{context}: invalid rate unit")
            if n_nonmissing != n_denominator or n_with_use > n_nonmissing:
                raise ProfileValidationError(f"{context}: invalid rate denominators")
        else:
            if raw["unit"] != "days/admission":
                raise ProfileValidationError(f"{context}: invalid LOS unit")
            if not (n_with_use <= n_nonmissing <= n_denominator):
                raise ProfileValidationError(f"{context}: invalid LOS denominators")

        rows.append(
            {
                "metric_id": metric_id,
                "metric_label": required_text(raw, "metric_label", context),
                "window": window,
                "severity": severity,
                "n_denominator": n_denominator,
                "n_nonmissing": n_nonmissing,
                "n_with_use": n_with_use,
                "mean": mean,
                "sd": sd,
                "median": median,
                "unit": required_text(raw, "unit", context),
                "denominator_definition": required_text(raw, "denominator_definition", context),
                "metric_definition": required_text(raw, "metric_definition", context),
                "suppressed": suppressed,
                "suppression_reason": suppression_reason or None,
            }
        )

    expected_keys = {
        (metric_id, window, severity)
        for metric_id in METRIC_IDS
        for window in WINDOWS
        for severity in SEVERITIES
    }
    if observed_keys != expected_keys:
        raise ProfileValidationError("source CSV does not form the required 7 x 2 x 5 grid")
    return rows


def aligned_columns(rows: list[dict[str, Any]]) -> dict[str, list[Any]]:
    return {field: [row[field] for row in rows] for field in PROFILE_COLUMNS}


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


def main() -> int:
    for path in (SOURCE_CSV, SOURCE_MANIFEST, WAS_MANIFEST):
        if not path.exists():
            raise FileNotFoundError(path)

    source_manifest = load_source_manifest()
    rows = load_rows()
    source_threshold = source_manifest.get("disclosure_threshold")
    if source_threshold != DISCLOSURE_THRESHOLD:
        raise ProfileValidationError("source disclosure threshold changed")

    metadata = {
        "dataset": "osa-utilwas-utilization-profile",
        "generated_at_utc": source_manifest.get("generated_at_utc"),
        "row_count": len(rows),
        "release_status": "owner_approved",
        "release_note": (
            "Aggregate descriptive profile approved for public release. Rates include zero-use patients; "
            "hospital length of stay is summarized per qualifying admission."
        ),
        "release_approved": True,
        "public_website_release_approved": True,
        "disclosure_threshold": DISCLOSURE_THRESHOLD,
        "windows": list(WINDOWS),
        "severities": list(SEVERITIES),
        "window_definitions": source_manifest["window_definitions"],
        "rate_denominator_definition": source_manifest["rate_denominator_definition"],
        "los_denominator_definition": source_manifest["los_denominator_definition"],
        "primary_care_specialty_list": source_manifest["exact_primary_care_specialty_list"],
        "specialty_care_definition": source_manifest["specialty_care_definition"],
        "ed_inpatient_overlap_warning": source_manifest["ed_inpatient_overlap_warning"],
        "source_sha256": {
            "profile_csv": sha256(SOURCE_CSV),
            "profile_manifest": sha256(SOURCE_MANIFEST),
        },
    }
    payload = {
        "schema_version": SCHEMA_VERSION,
        "metadata": metadata,
        "columns": aligned_columns(rows),
    }
    write_json(OUTPUT_JSON, payload)

    was_manifest = json.loads(WAS_MANIFEST.read_text(encoding="utf-8"))
    was_manifest["utilization_profile"] = {
        "path": OUTPUT_JSON.name,
        "row_count": len(rows),
        "release_status": metadata["release_status"],
        "release_note": metadata["release_note"],
        "windows": list(WINDOWS),
        "severities": list(SEVERITIES),
    }
    write_json(WAS_MANIFEST, was_manifest)
    print(
        json.dumps(
            {
                "output": f"public/data/{OUTPUT_JSON.name}",
                "rows": len(rows),
                "suppressed": sum(bool(row["suppressed"]) for row in rows),
                "release_status": metadata["release_status"],
            },
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
