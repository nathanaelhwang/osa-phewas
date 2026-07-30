#!/usr/bin/env python3
"""Export allowlisted aggregate Incidence PheDAS cumulative-incidence curves.

The source paths are fixed. This exporter never reads the patient-level
patient-level parquet files. Exact risk-set and event-count columns are used
only for validation and are deliberately withheld from browser JSON.
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


SCHEMA_VERSION = 2
EXPORTER_VERSION = "2.0.0"
DEFAULT_RELEASE = "2026-07-29"
DEFAULT_FEATURE = "401.1"

WEBSITE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WEBSITE_ROOT.parent
SOURCE_ROOT = PROJECT_ROOT / "results" / "incwas_results" / "survival_curves"
LANDMARK_SOURCE_ROOT = (
    PROJECT_ROOT / "results" / "incwas_results" / "survival_curves_landmark"
)
OUTPUT_ROOT = WEBSITE_ROOT / "public" / "data"

SOURCES = {
    "documentation": {
        "path": SOURCE_ROOT / "README.md",
        "root": SOURCE_ROOT,
        "role": "Source methods and caveats",
        "columns": None,
    },
    "features": {
        "path": SOURCE_ROOT / "fdr_phecodes.csv",
        "root": SOURCE_ROOT,
        "role": "FDR-significant feature metadata",
        "columns": {
            "phecode",
            "phenotype",
            "category",
            "n_atrisk",
            "n_events",
            "severe_hr",
            "sig_contrasts",
            "osa_control",
        },
    },
    "severity_curves": {
        "path": SOURCE_ROOT / "curve_severity.csv",
        "root": SOURCE_ROOT,
        "role": "Aalen-Johansen curves by OSA severity",
        "columns": {
            "phecode",
            "phenotype",
            "group",
            "time_years",
            "cif_pct",
            "n_at_risk",
            "n_events_cum",
        },
    },
    "landmark_documentation": {
        "path": LANDMARK_SOURCE_ROOT / "README.md",
        "root": LANDMARK_SOURCE_ROOT,
        "role": "Landmark CPAP methods and caveats",
        "columns": None,
    },
    "cpap_curves": {
        "path": LANDMARK_SOURCE_ROOT / "curve_adherence.csv",
        "root": LANDMARK_SOURCE_ROOT,
        "role": "Landmark Aalen-Johansen curves by CPAP adherence among OSA patients",
        "columns": {
            "phecode",
            "phenotype",
            "window_days",
            "group",
            "time_years",
            "cif_pct",
            "n_at_risk",
            "n_events_cum",
        },
    },
}

SEVERITY_GROUPS = ("No OSA", "Mild", "Moderate", "Severe")
CPAP_WINDOWS = (180, 90)
CPAP_GROUPS = (
    "4+ hr/night",
    "2-4 hr/night",
    "0-2 hr/night",
    "never-started",
    "unknown",
)
CONTRASTS = (
    "omnibus",
    "mild_vs_none",
    "moderate_vs_none",
    "severe_vs_none",
    "trend",
    "ahi_ge5",
    "ahi_ge15",
)
TIME_GRID = tuple(round(index / 12, 4) for index in range(73))
LANDMARK_TIME_GRID = tuple(round(index / 12, 4) for index in range(61))
TABLE_TIME_YEARS = (0, 1, 2, 3, 4, 5, 6)
LANDMARK_TABLE_TIME_YEARS = (0, 1, 2, 3, 4, 5)
CURVE_BASELINE_MIN = 20
CURVE_EVENTS_MIN = 5
LANDMARK_CURVE_EVENTS_MIN = 3

BLOCKED_HEADER_TOKENS = {
    "address",
    "dob",
    "email",
    "encounter",
    "id",
    "identifier",
    "member",
    "mrn",
    "participant",
    "patient",
    "person",
    "phone",
    "ssn",
    "subject",
    "visit",
}


class ExportValidationError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-id", default=DEFAULT_RELEASE)
    return parser.parse_args()


def validate_release_id(release_id: str) -> None:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", release_id):
        raise ExportValidationError("invalid release ID")


def header_tokens(header: str) -> set[str]:
    normalized = re.sub(r"[^a-z0-9]+", "_", header.casefold()).strip("_")
    return set(normalized.split("_"))


def validate_header(
    source_id: str, expected: set[str], fields: list[str] | None
) -> None:
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
            f"missing={sorted(expected - actual)}, "
            f"unexpected={sorted(actual - expected)}"
        )


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


def finite_number(row: dict[str, str | None], key: str, context: str) -> float:
    value = required_text(row, key, context)
    try:
        parsed = float(value)
    except ValueError as exc:
        raise ExportValidationError(f"{context}: non-numeric {key!r}") from exc
    if not math.isfinite(parsed):
        raise ExportValidationError(f"{context}: non-finite {key!r}")
    return parsed


def integer(row: dict[str, str | None], key: str, context: str) -> int:
    parsed = finite_number(row, key, context)
    if not parsed.is_integer():
        raise ExportValidationError(f"{context}: non-integer {key!r}")
    return int(parsed)


def strict_boolean(row: dict[str, str | None], key: str, context: str) -> bool:
    value = required_text(row, key, context)
    if value == "True":
        return True
    if value == "False":
        return False
    raise ExportValidationError(f"{context}: invalid Boolean {key!r}")


def validate_phecode(value: str, context: str) -> str:
    if not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", value):
        raise ExportValidationError(f"{context}: unsafe PheCode")
    return value


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_csv(source_id: str) -> list[dict[str, str | None]]:
    spec = SOURCES[source_id]
    path = spec["path"].resolve(strict=True)
    source_root = spec["root"].resolve(strict=True)
    if path.parent != source_root:
        raise ExportValidationError(f"{source_id}: source escaped allowlisted directory")
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        validate_header(source_id, spec["columns"], reader.fieldnames)
        rows = []
        for row_number, row in enumerate(reader, start=2):
            if None in row:
                raise ExportValidationError(
                    f"{source_id} row {row_number}: extra CSV fields"
                )
            rows.append(row)
    if not rows:
        raise ExportValidationError(f"{source_id}: empty CSV")
    return rows


def load_features() -> dict[str, dict[str, Any]]:
    features: dict[str, dict[str, Any]] = {}
    for row_number, row in enumerate(read_csv("features"), start=2):
        context = f"features row {row_number}"
        code = validate_phecode(required_text(row, "phecode", context), context)
        if code in features:
            raise ExportValidationError(f"{context}: duplicate PheCode")
        n_atrisk = integer(row, "n_atrisk", context)
        n_events = integer(row, "n_events", context)
        severe_hr = finite_number(row, "severe_hr", context)
        if n_atrisk <= 0 or n_events < 0 or n_events > n_atrisk:
            raise ExportValidationError(f"{context}: invalid feature-level counts")
        if severe_hr <= 0:
            raise ExportValidationError(f"{context}: non-positive severe-vs-none HR")
        sig_contrasts = required_text(row, "sig_contrasts", context).split(",")
        if (
            not sig_contrasts
            or len(sig_contrasts) != len(set(sig_contrasts))
            or any(item not in CONTRASTS for item in sig_contrasts)
        ):
            raise ExportValidationError(f"{context}: invalid significant contrasts")
        features[code] = {
            "feature_id": code,
            "feature_name": required_text(row, "phenotype", context),
            "category": required_text(row, "category", context),
            "n_atrisk_internal": n_atrisk,
            "n_events_internal": n_events,
            "severe_hr": severe_hr,
            "sig_contrasts": sig_contrasts,
            "osa_control": strict_boolean(row, "osa_control", context),
        }
    controls = {code for code, feature in features.items() if feature["osa_control"]}
    if controls != {"327.3"}:
        raise ExportValidationError("features: expected only PheCode 327.3 as OSA control")
    return features


def load_curves(
    source_id: str,
    features: dict[str, dict[str, Any]],
) -> dict[tuple[str, ...], list[dict[str, Any]]]:
    is_cpap = source_id == "cpap_curves"
    series: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
    seen: set[tuple[str, ...]] = set()
    for row_number, row in enumerate(read_csv(source_id), start=2):
        context = f"{source_id} row {row_number}"
        code = validate_phecode(required_text(row, "phecode", context), context)
        if code not in features:
            raise ExportValidationError(f"{context}: PheCode missing from feature metadata")
        if required_text(row, "phenotype", context) != features[code]["feature_name"]:
            raise ExportValidationError(f"{context}: phenotype mismatch")
        group = required_text(row, "group", context)
        if group not in (CPAP_GROUPS if is_cpap else SEVERITY_GROUPS):
            raise ExportValidationError(f"{context}: unsupported group")
        window_days = integer(row, "window_days", context) if is_cpap else None
        if is_cpap and window_days not in CPAP_WINDOWS:
            raise ExportValidationError(f"{context}: unsupported landmark window")
        time_years = finite_number(row, "time_years", context)
        cif_pct = finite_number(row, "cif_pct", context)
        n_at_risk = integer(row, "n_at_risk", context)
        n_events_cum = integer(row, "n_events_cum", context)
        maximum_time = 5 if is_cpap else 6
        if time_years < 0 or time_years > maximum_time:
            raise ExportValidationError(
                f"{context}: time outside 0-{maximum_time} years"
            )
        if cif_pct < 0 or cif_pct > 100:
            raise ExportValidationError(f"{context}: CIF outside 0-100 percent")
        if n_at_risk < 0 or n_events_cum < 0:
            raise ExportValidationError(f"{context}: negative curve count")
        if n_at_risk > features[code]["n_atrisk_internal"]:
            raise ExportValidationError(f"{context}: risk set exceeds feature population")
        if n_events_cum > features[code]["n_events_internal"]:
            raise ExportValidationError(f"{context}: curve events exceed feature events")
        row_key = (code, str(window_days or ""), group, str(time_years))
        if row_key in seen:
            raise ExportValidationError(f"{context}: duplicate curve coordinate")
        seen.add(row_key)
        series_key = (code, window_days, group) if is_cpap else (code, group)
        series[series_key].append(
            {
                "time_years": time_years,
                "cif_pct": cif_pct,
                "n_at_risk_internal": n_at_risk,
                "n_events_cum_internal": n_events_cum,
            }
        )
    if {key[0] for key in series} != set(features):
        raise ExportValidationError(f"{source_id}: feature join is not exact")
    return series


def validate_series(
    series: dict[tuple[str, ...], list[dict[str, Any]]],
    context: str,
    expected_time_grid: tuple[float, ...],
    minimum_events: int,
) -> None:
    for key, points in series.items():
        points.sort(key=lambda point: point["time_years"])
        times = tuple(point["time_years"] for point in points)
        if times != expected_time_grid:
            raise ExportValidationError(f"{context} {key}: unexpected monthly time grid")
        cifs = [point["cif_pct"] for point in points]
        risks = [point["n_at_risk_internal"] for point in points]
        events = [point["n_events_cum_internal"] for point in points]
        if cifs[0] != 0 or events[0] != 0:
            raise ExportValidationError(f"{context} {key}: nonzero curve origin")
        if any(next_value < value for value, next_value in zip(cifs, cifs[1:])):
            raise ExportValidationError(f"{context} {key}: decreasing CIF")
        if any(next_value > value for value, next_value in zip(risks, risks[1:])):
            raise ExportValidationError(f"{context} {key}: increasing risk set")
        if any(next_value < value for value, next_value in zip(events, events[1:])):
            raise ExportValidationError(f"{context} {key}: decreasing cumulative events")
        if risks[0] < CURVE_BASELINE_MIN or events[-1] < minimum_events:
            raise ExportValidationError(f"{context} {key}: source threshold violation")


def validate_severity(
    series: dict[tuple[str, ...], list[dict[str, Any]]],
    features: dict[str, dict[str, Any]],
) -> None:
    expected = {(code, group) for code in features for group in SEVERITY_GROUPS}
    if set(series) != expected:
        raise ExportValidationError("severity_curves: incomplete severity series")
    for code, feature in features.items():
        baseline_total = sum(
            series[(code, group)][0]["n_at_risk_internal"]
            for group in SEVERITY_GROUPS
        )
        if baseline_total != feature["n_atrisk_internal"]:
            raise ExportValidationError(
                f"severity_curves {code}: baseline groups do not reconcile"
            )


def validate_cpap(
    cpap: dict[tuple[str, ...], list[dict[str, Any]]],
    features: dict[str, dict[str, Any]],
) -> None:
    actual = set(cpap)
    allowed = {
        (code, window_days, group)
        for code in features
        for window_days in CPAP_WINDOWS
        for group in CPAP_GROUPS
    }
    unexpected = sorted(actual - allowed)
    if unexpected:
        raise ExportValidationError(
            f"cpap_curves: unexpected series availability; unexpected={unexpected}"
        )
    for code in features:
        for window_days in CPAP_WINDOWS:
            available = {
                group
                for candidate_code, candidate_window, group in actual
                if candidate_code == code and candidate_window == window_days
            }
            if not available or "never-started" not in available:
                raise ExportValidationError(
                    f"cpap_curves {code} {window_days}: required landmark strata missing"
                )


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


def strata_metadata() -> dict[str, Any]:
    return {
        "severity_group_order": list(SEVERITY_GROUPS),
        "cpap_window_order": list(CPAP_WINDOWS),
        "cpap_group_order": list(CPAP_GROUPS),
        "cpap_window_label": "Landmark grace period",
        "cpap_window_definition": (
            "The clock starts at index plus the selected grace period among OSA "
            "patients who remain under observation and event-free to that landmark."
        ),
        "cpap_exposure_label": "Landmark CPAP adherence",
        "cpap_exposure_definition": (
            "Source-defined nightly-use categories among OSA patients after a "
            "90- or 180-day landmark. Unknown means a device was set up but usage "
            "was not captured."
        ),
    }


def disclosure_metadata() -> dict[str, Any]:
    return {
        "release_status": "public_research_release",
        "release_note": (
            "Aggregate cumulative-incidence percentages are approved for public "
            "research dissemination; exact monthly count arrays remain withheld."
        ),
        "counts_disclosure_status": "withheld_from_public_release",
        "counts_withheld": [
            "feature-level at-risk count",
            "feature-level event count",
            "timepoint risk-set count",
            "timepoint cumulative-event count",
        ],
        "risk_table_available": False,
        "downloads_enabled": False,
        "public_release_allowed": True,
    }


def feature_payload(
    feature: dict[str, Any],
    severity: dict[tuple[str, ...], list[dict[str, Any]]],
    cpap: dict[tuple[str, ...], list[dict[str, Any]]],
) -> dict[str, Any]:
    code = feature["feature_id"]
    severity_records = []
    for group in SEVERITY_GROUPS:
        severity_records.extend(
            {
                "group": group,
                "time_years": point["time_years"],
                "cif_pct": point["cif_pct"],
            }
            for point in severity[(code, group)]
        )

    cpap_records = []
    present_nonreference = set()
    for window_days in CPAP_WINDOWS:
        for group in CPAP_GROUPS:
            key = (code, window_days, group)
            if key not in cpap:
                continue
            present_nonreference.add((window_days, group))
            cpap_records.extend(
                {
                    "window_days": window_days,
                    "group": group,
                    "time_years": point["time_years"],
                    "cif_pct": point["cif_pct"],
                }
                for point in cpap[key]
            )
    omitted = [
        {
            "window_days": window_days,
            "group": group,
            "reason": "source_thin_stratum_rule",
        }
        for window_days in CPAP_WINDOWS
        for group in CPAP_GROUPS
        if (window_days, group) not in present_nonreference
    ]

    disclosure = disclosure_metadata()
    return {
        "schema_version": SCHEMA_VERSION,
        "metadata": {
            "feature_id": code,
            "feature_name": feature["feature_name"],
            "category": feature["category"],
            "severe_hr": feature["severe_hr"],
            "sig_contrasts": feature["sig_contrasts"],
            "osa_control": feature["osa_control"],
            "available_views": {"severity": True, "cpap": True},
            "selection_basis": (
                "FDR-significant at M4 in at least one source OSA contrast"
            ),
            "selection_model": "M4",
            "estimand": "Cumulative incidence (%)",
            "estimator": "Aalen-Johansen",
            "competing_event": "Death",
            "event_definition": (
                "Incident feature PheCode in the harmonized-washout at-risk set"
            ),
            "time_origin": "OSA study index",
            "cpap_time_origin": "Landmark at OSA study index plus selected grace period",
            "time_unit": "years",
            "follow_up_end": "2023-05-31",
            "curve_inclusion": {
                "minimum_baseline_at_risk": CURVE_BASELINE_MIN,
                "minimum_incident_events": CURVE_EVENTS_MIN,
                "cpap_minimum_incident_events": LANDMARK_CURVE_EVENTS_MIN,
                "thin_strata_omitted": True,
            },
            "table_time_years": list(TABLE_TIME_YEARS),
            "cpap_table_time_years": list(LANDMARK_TABLE_TIME_YEARS),
            "cpap_default_window_days": CPAP_WINDOWS[0],
            "cpap_interpretation": (
                "The grace-period landmark addresses immortal-time bias. Curves are "
                "still descriptive and unadjusted; healthy-adherer confounding remains."
            ),
            "release_status": disclosure["release_status"],
            "release_note": disclosure["release_note"],
            "counts_disclosure_status": disclosure["counts_disclosure_status"],
            "risk_table_available": disclosure["risk_table_available"],
            "downloads_enabled": disclosure["downloads_enabled"],
        },
        "strata": strata_metadata(),
        "severity": {
            "row_count": len(severity_records),
            "columns": aligned_columns(
                severity_records,
                ("group", "time_years", "cif_pct"),
                f"survival/{code}.json severity",
            ),
        },
        "cpap": {
            "row_count": len(cpap_records),
            "omitted_strata": omitted,
            "columns": aligned_columns(
                cpap_records,
                ("window_days", "group", "time_years", "cif_pct"),
                f"survival/{code}.json cpap",
            ),
        },
    }


def source_metadata(row_counts: dict[str, int]) -> list[dict[str, Any]]:
    records = []
    for source_id, spec in SOURCES.items():
        path = spec["path"].resolve(strict=True)
        records.append(
            {
                "source_id": source_id,
                "file_name": path.name,
                "role": spec["role"],
                "row_count": row_counts.get(source_id),
                "sha256": sha256(path),
            }
        )
    return records


def build(release_id: str) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    features = load_features()
    severity = load_curves("severity_curves", features)
    cpap = load_curves("cpap_curves", features)
    validate_series(severity, "severity_curves", TIME_GRID, CURVE_EVENTS_MIN)
    validate_series(
        cpap,
        "cpap_curves",
        LANDMARK_TIME_GRID,
        LANDMARK_CURVE_EVENTS_MIN,
    )
    validate_severity(severity, features)
    validate_cpap(cpap, features)

    default_feature = DEFAULT_FEATURE if DEFAULT_FEATURE in features else sorted(features)[0]
    outputs = {
        f"survival/{code}.json": feature_payload(feature, severity, cpap)
        for code, feature in features.items()
    }
    feature_records = [
        {
            "feature_id": feature["feature_id"],
            "feature_name": feature["feature_name"],
            "category": feature["category"],
            "path": f"survival/{feature['feature_id']}.json",
            "available_views": {"severity": True, "cpap": True},
            "osa_control": feature["osa_control"],
        }
        for feature in sorted(
            features.values(),
            key=lambda item: (item["feature_name"].casefold(), item["feature_id"]),
        )
    ]
    severity_rows = sum(len(points) for points in severity.values())
    cpap_source_rows = sum(len(points) for points in cpap.values())
    cpap_export_rows = sum(payload["cpap"]["row_count"] for payload in outputs.values())
    row_counts = {
        "features": len(features),
        "severity_curves": severity_rows,
        "cpap_curves": cpap_source_rows,
    }
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "exporter_version": EXPORTER_VERSION,
        "release": {
            "id": release_id,
            "audience": "public researchers",
            "scope": "Aggregate Incidence PheDAS cumulative-incidence curves",
        },
        "defaults": {
            "feature_id": default_feature,
            "view": "severity",
            "feature_path": f"survival/{default_feature}.json",
            "window_days": CPAP_WINDOWS[0],
        },
        "analysis": {
            "analysis_id": "incidence-phedas-survival",
            "label": "Incidence PheDAS cumulative-incidence curves",
            "selection_basis": (
                "FDR-significant at M4 in at least one source OSA contrast"
            ),
            "selection_model": "M4",
            "estimand": "Cumulative incidence (%)",
            "estimator": "Aalen-Johansen",
            "competing_event": "Death",
            "follow_up_end": "2023-05-31",
            "curve_inclusion": {
                "minimum_baseline_at_risk": CURVE_BASELINE_MIN,
                "minimum_incident_events": CURVE_EVENTS_MIN,
                "cpap_minimum_incident_events": LANDMARK_CURVE_EVENTS_MIN,
                "thin_strata_omitted": True,
            },
            "table_time_years": list(TABLE_TIME_YEARS),
            "cpap_table_time_years": list(LANDMARK_TABLE_TIME_YEARS),
            "cpap_default_window_days": CPAP_WINDOWS[0],
        },
        "strata": strata_metadata(),
        "disclosure": disclosure_metadata(),
        "sources": source_metadata(row_counts),
        "features": feature_records,
        "counts": {
            "feature_count": len(features),
            "severity_curve_rows": severity_rows,
            "cpap_source_curve_rows": cpap_source_rows,
            "cpap_export_curve_rows": cpap_export_rows,
        },
    }
    outputs["survival-manifest.json"] = manifest
    return outputs, manifest


def reject_path_leaks(value: Any, context: str = "payload") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            reject_path_leaks(child, f"{context}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            reject_path_leaks(child, f"{context}[{index}]")
    elif isinstance(value, float) and not math.isfinite(value):
        raise ExportValidationError(f"non-finite output at {context}")
    elif isinstance(value, str):
        if re.match(r"^[A-Za-z]:[\\/]", value) or value.startswith(("/", "\\\\")):
            raise ExportValidationError(f"absolute path leaked at {context}")
        if ".." in re.split(r"[\\/]", value):
            raise ExportValidationError(f"parent path segment leaked at {context}")


def write_json(relative_path: str, payload: dict[str, Any]) -> None:
    if Path(relative_path).is_absolute() or ".." in Path(relative_path).parts:
        raise ExportValidationError("unsafe output path")
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
    validate_release_id(release_id)
    outputs, manifest = build(release_id)
    for payload in outputs.values():
        reject_path_leaks(payload)
    for path in sorted(outputs, key=lambda item: item == "survival-manifest.json"):
        write_json(path, outputs[path])
    print(
        json.dumps(
            {
                "output_root": "public/data",
                "files_written": len(outputs),
                "feature_count": manifest["counts"]["feature_count"],
                "severity_curve_rows": manifest["counts"]["severity_curve_rows"],
                "cpap_source_curve_rows": manifest["counts"]["cpap_source_curve_rows"],
                "cpap_export_curve_rows": manifest["counts"]["cpap_export_curve_rows"],
                "default_feature": manifest["defaults"]["feature_id"],
                "counts_disclosure_status": manifest["disclosure"][
                    "counts_disclosure_status"
                ],
            },
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
