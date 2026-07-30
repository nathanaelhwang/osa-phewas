#!/usr/bin/env python3
"""Export allowlisted aggregate octant-phenotype assets for the website.

Only fixed aggregate summaries and publication figures are read. Patient-level
phenotype assignments and cross-domain records are intentionally out of scope.
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
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
EXPORTER_VERSION = "1.0.0"
RELEASE_ID = "2026-07-29"

WEBSITE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WEBSITE_ROOT.parent
PHENOTYPE_ROOT = (
    PROJECT_ROOT / "latent-class-analysis" / "results" / "phenotypes"
)
PHENOTYPE_PLOT_ROOT = PROJECT_ROOT / "latent-class-analysis" / "results" / "plots"
SURVIVAL_ROOT = (
    PROJECT_ROOT
    / "results"
    / "incwas_results"
    / "phenotype_exposure"
    / "survival_plots"
)
OUTPUT_DATA = WEBSITE_ROOT / "public" / "data" / "phenotypes.json"
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

SIGNATURE_METRICS = {
    "ODI 4% (events/h)": ("odi4", "ODI 4%", "physiologic", "events/h"),
    "minimum SpO2 (%)": ("minimum_spo2", "Minimum SpO₂", "physiologic", "%"),
    "mean SpO2 (%)": ("mean_spo2", "Mean SpO₂", "physiologic", "%"),
    "T90 (fraction)": ("t90", "T90", "physiologic", "fraction"),
    "Epworth total": ("epworth", "Epworth total", "symptom", "score"),
    "Insomnia Severity Index": ("isi", "Insomnia Severity Index", "symptom", "score"),
    "FOSQ impairment": ("fosq_impairment", "FOSQ impairment", "symptom", "score"),
    "PHQ-2": ("phq2", "PHQ-2", "symptom", "score"),
    "STOP score": ("stop", "STOP score", "symptom", "score"),
    "distinct phecodes": ("distinct_phecodes", "Distinct PheCodes", "comorbidity", "count"),
    "obesity": ("obesity", "Obesity", "comorbidity", "proportion"),
    "hyperlipidemia": ("hyperlipidemia", "Hyperlipidemia", "comorbidity", "proportion"),
    "hypertension": ("hypertension", "Hypertension", "comorbidity", "proportion"),
    "impaired fasting glucose": ("impaired_fasting_glucose", "Impaired fasting glucose", "comorbidity", "proportion"),
    "anxiety disorders": ("anxiety_disorders", "Anxiety disorders", "comorbidity", "proportion"),
    "GERD": ("gerd", "GERD", "comorbidity", "proportion"),
    "index AHI (events/h)": ("index_ahi", "Index AHI", "external", "events/h"),
}

SOURCES = {
    "octants": {
        "path": PHENOTYPE_ROOT / "octants.csv",
        "root": PHENOTYPE_ROOT,
        "role": "Octant sizes and headline summaries",
    },
    "signature": {
        "path": PHENOTYPE_ROOT / "octant_clinical_signature.csv",
        "root": PHENOTYPE_ROOT,
        "role": "Aggregate clinical signature by octant",
    },
    "cuts": {
        "path": PHENOTYPE_ROOT / "octant_cuts.json",
        "root": PHENOTYPE_ROOT,
        "role": "Cohort-derived median score cuts",
    },
    "summary": {
        "path": PHENOTYPE_ROOT / "phenotype_summary.json",
        "root": PHENOTYPE_ROOT,
        "role": "Shared-cohort and score-independence summary",
    },
    "construction_image": {
        "path": PHENOTYPE_PLOT_ROOT / "fig12_octant_construction.png",
        "root": PHENOTYPE_PLOT_ROOT,
        "role": "Octant construction figure",
    },
    "signature_image": {
        "path": PHENOTYPE_PLOT_ROOT / "fig13_octant_signature.png",
        "root": PHENOTYPE_PLOT_ROOT,
        "role": "Octant clinical-signature figure",
    },
    "phecode_survival": {
        "path": SURVIVAL_ROOT / "octant_cif_phecode_3yr.csv",
        "root": SURVIVAL_ROOT,
        "role": "PheCode-level octant survival summaries",
    },
    "system_survival": {
        "path": SURVIVAL_ROOT / "octant_cif_system_3yr.csv",
        "root": SURVIVAL_ROOT,
        "role": "Body-system octant survival summaries",
    },
    "phecode_survival_image": {
        "path": SURVIVAL_ROOT / "octant_cif_phecode.png",
        "root": SURVIVAL_ROOT,
        "role": "PheCode-level octant cumulative-incidence figure",
    },
    "system_survival_image": {
        "path": SURVIVAL_ROOT / "octant_cif_system.png",
        "root": SURVIVAL_ROOT,
        "role": "Body-system octant cumulative-incidence figure",
    },
}

SURVIVAL_FIELDS = {
    "level",
    "outcome",
    "name",
    "octant",
    "hr_m4",
    "ci_low",
    "ci_high",
    "p",
    "n_focal",
    "ev_focal",
    "n_rest",
    "ev_rest",
    "cif3_focal_pct",
    "cif3_rest_pct",
}


class ExportValidationError(RuntimeError):
    pass


def source_path(source_id: str) -> Path:
    spec = SOURCES[source_id]
    path = spec["path"].resolve(strict=True)
    if path.parent != spec["root"].resolve(strict=True):
        raise ExportValidationError(f"{source_id}: source escaped allowlisted directory")
    return path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_csv(source_id: str, expected_fields: set[str]) -> list[dict[str, str]]:
    with source_path(source_id).open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames
        if fields is None or set(fields) != expected_fields or len(fields) != len(set(fields)):
            raise ExportValidationError(f"{source_id}: unexpected CSV schema")
        rows = []
        for row_number, row in enumerate(reader, start=2):
            if None in row or any(value is None for value in row.values()):
                raise ExportValidationError(f"{source_id} row {row_number}: malformed CSV")
            rows.append({key: value for key, value in row.items() if key is not None})
    if not rows:
        raise ExportValidationError(f"{source_id}: empty CSV")
    return rows


def finite(value: str, context: str) -> float:
    try:
        parsed = float(value)
    except ValueError as exc:
        raise ExportValidationError(f"{context}: non-numeric value") from exc
    if not math.isfinite(parsed):
        raise ExportValidationError(f"{context}: non-finite value")
    return parsed


def whole(value: str, context: str) -> int:
    parsed = finite(value, context)
    if not parsed.is_integer():
        raise ExportValidationError(f"{context}: non-integer value")
    return int(parsed)


def load_octants() -> list[dict[str, Any]]:
    fields = {"octant", "n", "median_ahi", "median_codes", "pct"}
    by_id: dict[str, dict[str, Any]] = {}
    for row in read_csv("octants", fields):
        octant = row["octant"]
        if octant not in OCTANT_BITS or octant in by_id:
            raise ExportValidationError("octants: unexpected or duplicate octant")
        count = whole(row["n"], f"octants {octant} n")
        pct = finite(row["pct"], f"octants {octant} pct")
        if count < 11 or not 0 < pct < 1:
            raise ExportValidationError(f"octants {octant}: invalid public aggregate")
        bits = OCTANT_BITS[octant]
        by_id[octant] = {
            "id": octant,
            "label": octant.replace("-", " ").title(),
            "glyph": "".join("■" if bit else "□" for bit in bits),
            "bits": list(bits),
            "n": count,
            "pct": pct,
            "median_ahi": finite(row["median_ahi"], f"octants {octant} AHI"),
            "median_codes": finite(row["median_codes"], f"octants {octant} codes"),
            "summary": OCTANT_SUMMARIES[octant],
        }
    if set(by_id) != set(OCTANT_ORDER) or sum(item["n"] for item in by_id.values()) != 70_880:
        raise ExportValidationError("octants: cohort reconciliation failed")
    return [by_id[octant] for octant in OCTANT_ORDER]


def load_signature(octants: list[dict[str, Any]]) -> None:
    fields = {"", *OCTANT_ORDER}
    rows = read_csv("signature", fields)
    if {row[""] for row in rows} != set(SIGNATURE_METRICS):
        raise ExportValidationError("signature: unexpected metric set")
    by_octant = {item["id"]: {} for item in octants}
    for row in rows:
        source_name = row[""]
        metric_id, label, domain, unit = SIGNATURE_METRICS[source_name]
        for octant in OCTANT_ORDER:
            by_octant[octant][metric_id] = {
                "label": label,
                "domain": domain,
                "unit": unit,
                "value": finite(row[octant], f"signature {source_name} {octant}"),
            }
    for item in octants:
        item["signature"] = by_octant[item["id"]]


def load_json(source_id: str) -> dict[str, Any]:
    with source_path(source_id).open(encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ExportValidationError(f"{source_id}: expected object")
    return payload


def load_survival(source_id: str, level: str, expected_rows: int) -> list[dict[str, Any]]:
    rows = read_csv(source_id, SURVIVAL_FIELDS)
    if len(rows) != expected_rows:
        raise ExportValidationError(f"{source_id}: unexpected row count")
    records = []
    for row_number, row in enumerate(rows, start=2):
        context = f"{source_id} row {row_number}"
        octant = row["octant"]
        if row["level"] != level or octant not in OCTANT_BITS:
            raise ExportValidationError(f"{context}: unexpected level or octant")
        hr = finite(row["hr_m4"], context)
        ci_low = finite(row["ci_low"], context)
        ci_high = finite(row["ci_high"], context)
        p_value = finite(row["p"], context)
        n_focal = whole(row["n_focal"], context)
        events_focal = whole(row["ev_focal"], context)
        n_rest = whole(row["n_rest"], context)
        events_rest = whole(row["ev_rest"], context)
        focal_cif = finite(row["cif3_focal_pct"], context)
        rest_cif = finite(row["cif3_rest_pct"], context)
        if not 0 < ci_low <= hr <= ci_high:
            raise ExportValidationError(f"{context}: invalid hazard-ratio interval")
        if not 0 <= p_value <= 1 or min(n_focal, events_focal, n_rest, events_rest) < 11:
            raise ExportValidationError(f"{context}: invalid public count or p-value")
        if events_focal > n_focal or events_rest > n_rest:
            raise ExportValidationError(f"{context}: events exceed population")
        if not 0 <= focal_cif <= 100 or not 0 <= rest_cif <= 100:
            raise ExportValidationError(f"{context}: invalid cumulative incidence")
        outcome = row["outcome"]
        if level == "phecode" and not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", outcome):
            raise ExportValidationError(f"{context}: unsafe PheCode")
        records.append(
            {
                "outcome_id": outcome,
                "outcome_name": row["name"],
                "octant": octant,
                "hr_m4": hr,
                "ci_low": ci_low,
                "ci_high": ci_high,
                "p": p_value,
                "n_focal": n_focal,
                "events_focal": events_focal,
                "n_rest": n_rest,
                "events_rest": events_rest,
                "cif3_focal_pct": focal_cif,
                "cif3_rest_pct": rest_cif,
            }
        )
    return records


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ExportValidationError(f"{path.name}: invalid PNG")
    return struct.unpack(">II", header[16:24])


def image_record(source_id: str, output_name: str, expected: tuple[int, int]) -> dict[str, Any]:
    path = source_path(source_id)
    dimensions = png_dimensions(path)
    if dimensions != expected:
        raise ExportValidationError(f"{source_id}: unexpected image dimensions")
    return {
        "path": f"images/phenotypes/{output_name}",
        "width": dimensions[0],
        "height": dimensions[1],
    }


def source_metadata() -> list[dict[str, Any]]:
    return [
        {
            "source_id": source_id,
            "file_name": source_path(source_id).name,
            "role": spec["role"],
            "sha256": sha256(source_path(source_id)),
        }
        for source_id, spec in SOURCES.items()
    ]


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


def build() -> dict[str, Any]:
    octants = load_octants()
    load_signature(octants)
    cuts = load_json("cuts")
    summary = load_json("summary")
    if set(cuts) != {"score_c1", "score_c2", "score_c3"}:
        raise ExportValidationError("cuts: unexpected keys")
    if summary.get("n_shared") != sum(item["n"] for item in octants):
        raise ExportValidationError("summary: cohort reconciliation failed")
    score_correlations = summary.get("score_spearman")
    if not isinstance(score_correlations, dict):
        raise ExportValidationError("summary: score correlations missing")

    construction_image = image_record(
        "construction_image", "octant-construction.png", (2055, 1269)
    )
    signature_image = image_record(
        "signature_image", "octant-signature.png", (1657, 1472)
    )
    phecode_image = image_record(
        "phecode_survival_image", "octant-cif-phecode.png", (2257, 1180)
    )
    system_image = image_record(
        "system_survival_image", "octant-cif-system.png", (2281, 2932)
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
            "shared_cohort_n": summary["n_shared"],
            "classification_coverage_pct": 100,
            "method": "Each posterior-weighted domain score is split at its shared-cohort median.",
            "cut_points": {key: finite(str(value), f"cuts {key}") for key, value in cuts.items()},
            "cut_point_note": "Cohort-derived medians are descriptive, not clinical thresholds, and do not transfer unchanged to another sample.",
            "axis_order": [axis["id"] for axis in AXES],
            "axes": list(AXES),
            "score_spearman": score_correlations,
            "image": construction_image,
        },
        "octants": octants,
        "signature_figure": signature_image,
        "survival": {
            "analysis_label": "Octant-exposure Incidence PheDAS",
            "comparison": "Named octant versus the pooled other seven",
            "estimator": "Aalen-Johansen cumulative incidence with death competing",
            "hazard_model": "Adjusted M4 cause-specific Cox model",
            "curve_note": "Curves are unadjusted; annotated hazard ratios are adjusted. Absolute and relative estimates answer different questions.",
            "time_horizon_years": 3,
            "levels": [
                {
                    "id": "phecode",
                    "label": "PheCode outcomes",
                    "description": "Six Bonferroni-significant one-vs-rest contrasts at the PheCode level.",
                    "image": phecode_image,
                    "rows": load_survival("phecode_survival", "phecode", 6),
                },
                {
                    "id": "system",
                    "label": "Body-system outcomes",
                    "description": "Fifteen Bonferroni-significant contrasts. The outcome is the first new PheCode in a system, a diagnostic-accrual measure rather than first-ever disease.",
                    "image": system_image,
                    "rows": load_survival("system_survival", "system", 15),
                },
            ],
        },
        "caveats": [
            "The physiology and comorbidity classes are regions of continuous gradients, not discovered biological subpopulations.",
            "The comorbidity axis also reflects healthcare contact and record completeness.",
            "Octants are strongly structured by age and sex; downstream M4 models adjust for both, but unadjusted comparisons are not causal.",
            "Octant survival figures are validated publication assets. No aggregate monthly time-series release is available for browser-redrawn curves.",
        ],
        "sources": source_metadata(),
    }
    reject_path_leaks(payload)
    return payload


def write_json(payload: dict[str, Any]) -> None:
    OUTPUT_DATA.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT_DATA.with_suffix(".json.tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            handle.write("\n")
        os.replace(temporary, OUTPUT_DATA)
    finally:
        if temporary.exists():
            temporary.unlink()


def copy_images() -> None:
    OUTPUT_IMAGES.mkdir(parents=True, exist_ok=True)
    copies = {
        "construction_image": "octant-construction.png",
        "signature_image": "octant-signature.png",
        "phecode_survival_image": "octant-cif-phecode.png",
        "system_survival_image": "octant-cif-system.png",
    }
    for source_id, output_name in copies.items():
        shutil.copyfile(source_path(source_id), OUTPUT_IMAGES / output_name)


def main() -> int:
    payload = build()
    write_json(payload)
    copy_images()
    print(
        json.dumps(
            {
                "output": "public/data/phenotypes.json",
                "octants": len(payload["octants"]),
                "survival_panels": sum(
                    len(level["rows"]) for level in payload["survival"]["levels"]
                ),
                "images": 4,
            },
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
