# Aggregate disease data export

Run from the `website` directory with the active conda environment:

```powershell
python .\scripts\export_disease_data.py
```

An optional public release label can be supplied with `--release-id`. The
exporter has no source-path option: it reads only the allowlisted aggregate
prevalence and incidence PheDAS summaries in the project `results` directory.
It rejects schema drift, identifier-like columns, unknown models or contrasts,
duplicate associations, unexpected QC values, and non-finite numbers.

Outputs are compact aligned-column JSON under `public/data`:

- `atlas-manifest.json` lists release/source metadata and all partition counts.
- `features.json` is the searchable union of PheCodes, with analysis
  availability flags and alternate phenotype names.
- `phedas/{analysis}/{model}/{contrast}.json` contains one plot-ready
  association partition.

The manifest selects prevalence PheDAS, M4, and `severe_vs_none` by default.
PheCodes remain JSON strings, including decimal codes such as `401.1`.

## Aggregate multi-WAS data export

Run the LabWAS, MedWAS, BehWAS, ProcWAS, and UtilWAS exporter separately:

```powershell
python .\scripts\export_multiwas_data.py
```

This exporter also has no source-path option. It reads only fixed, allowlisted
aggregate CSV snapshots under `results/archived results`; it never reads cohort,
event, target-matrix, or patient-level files. It exports source-defined M1–M4
results when a model is available and intentionally excludes the distinct
`unadjusted` rows. Unsupported cells are omitted rather
than emitted as empty partitions—for example, the current L1 MedWAS snapshot
does not contain adjusted omnibus tests.

Outputs are written without changing the disease export:

- `was-manifest.json` describes the 11 analyses, release status, sources, and
  every non-empty partition.
- `was-features.json` is the searchable cross-family feature registry.
- `was/{analysis_id}/{window}/{model}/{contrast}.json` contains one homogeneous,
  plot-ready association partition.

The default multi-WAS view is 1-year mean LabWAS, M4, `severe_vs_none`. LOINC,
GPI-4, PheCode, behavior, procedure, and specialty identifiers remain strings.
Aggregate count companions are joined where they already exist; the exporter
does not reconstruct or infer missing exposure-by-outcome cells. LabWAS,
MedWAS, and ProcWAS are marked as archived snapshots, BehWAS as preliminary
archived results, and UtilWAS as archived results pending review.

## Aggregate QWAS data export

After the multi-WAS export has created `was-manifest.json` and
`was-features.json`, add the owner-approved questionnaire-wide association
study with:

```powershell
python .\scripts\export_multiwas_data.py
python .\scripts\export_qwas_data.py
```

This order is required. The QWAS exporter validates and augments the existing
multi-WAS manifest and feature registry rather than replacing them. If the
multi-WAS export is rerun, rerun the QWAS exporter before validation or
deployment.

The exporter has no source-path option and reads only two fixed aggregate or
metadata inputs: `results/qwas_results/analysis/results.csv` and
`results/qwas_results/targets/feature_spec.csv`. It never reads the target
matrix, questionnaire-wide patient records, or other patient-level files.
Publication fails closed unless `scripts/qwas_release_approval.json` approves
public release and its SHA-256 hashes match both inputs.

QWAS is split into two homogeneous, index-anchored analyses using the closest
questionnaire on or before the sleep-study index:

- `qwas_binary` reports odds ratios for binary questionnaire responses.
- `qwas_continuous` reports rank-inverse-normal standard-deviation betas for
  ordinal or continuous responses.

Both analyses publish source-defined M1–M4 results across omnibus, trend,
severity-versus-none, and AHI-threshold contrasts; source `unadjusted` rows are
excluded. Outputs are 56 partitions under
`public/data/was/{analysis_id}/index/{model}/{contrast}.json`, plus QWAS entries
in the shared manifest and feature registry.

Interpret these as cross-sectional, itemwise complete-case associations in the
questionnaire-eligible referral cohort. The per-feature `n` is the answered
sample supplied to the source formula, not a model-specific fitted count after
adjustment-covariate missingness. Referral-driving items are explicitly flagged
because ascertainment may contribute to their associations. Instrument-item
concept labels are provisional where validated public question wording was not
available; the feature code remains visible for auditability.

Publish the separately approved, descriptive UtilWAS utilization profile after
the multi-WAS manifest exists:

```powershell
python .\scripts\export_utilization_profile.py
```

This exporter reads only the aggregate 70-row profile and its release manifest
under `results/utilwas_results/website_exports`. It requires both public-release
flags, an owner-approved primary-care crosswalk, a complete 7 Ã— 2 Ã— 5 grid,
and disclosure-safe supporting counts. It writes
`public/data/was-utilization-profile.json` and adds a top-level profile
reference to `was-manifest.json`; patient-level source paths are not published.

## Aggregate Incidence PheDAS curve export

Export the plot-ready cumulative-incidence curves separately:

```powershell
python .\scripts\export_survival_data.py
```

The exporter reads fixed, allowlisted aggregate files from two locations. The
FDR feature list and severity curves come from
`results/incwas_results/survival_curves`; landmark CPAP curves come from
`results/incwas_results/survival_curves_landmark/curve_adherence.csv`. It never
reads either patient-level parquet and has no source-path option. Exact schemas,
feature joins, landmark windows, group labels, monthly time grids, numeric
ranges, monotonicity, source curve thresholds, and source hashes are validated
before any website file is written.

Outputs are:

- `survival-manifest.json`, which records provenance, estimand and stratum
  semantics, disclosure status, feature paths, and the default feature.
- `survival/{phecode}.json`, one columnar severity and landmark CPAP payload per
  FDR-significant PheCode.

Browser JSON contains only `time_years` and aggregate Aalen-Johansen
`cif_pct` curve values. Exact feature-level and timepoint risk/event counts are
validated internally but withheld from browser JSON. Risk tables and downloads
therefore remain disabled. Landmark CPAP curves are OSA-pooled and use 90- and
180-day grace periods; they address immortal-time bias but remain descriptive
and vulnerable to healthy-adherer confounding.

## Aggregate octant-phenotype export

Export the public phenotype summary, expanded cluster distributions, documented
CPAP setup/coverage summaries, M4 model index, and disclosure-controlled
three-year curve assets with:

```powershell
python .\scripts\export_phenotype_data.py
```

The exporter reads only the validated `website_exports` aggregate package and
four fixed publication PNGs. CPAP publication is additionally bound to the
exact audited CSV and audit hashes in `scripts/phenotype_release_approval.json`.
It intentionally has no source entry for the patient-level phenotype assignment
or cross-domain phenotype files. Outputs are:

- `public/data/phenotypes.json`, containing eight octants, 26 measures, five-window
  CPAP setup/coverage summaries, and all 168 M4 one-vs-rest panel records;
- `public/data/phenotype-survival/{level}/{outcome}.json`, 21 lazy-loaded outcome
  assets with tie-aware Aalen–Johansen coordinates and annual risk tables; and
- four images under `public/images/phenotypes/` for supplemental publication context.

Exact counts below 11 are emitted as `null`, never zero. Curve coordinates are
withheld for the 16 panels whose focal event count is suppressed; their model
metadata and disclosure-safe annual at-risk values remain searchable. Internal
audit CSVs are validated through the source manifest but are never copied into
the public bundle. CPAP adherence outcomes and usage distributions remain
unavailable; the published adherence/usage percentages describe source-field
availability among documented setups, not adherence or treatment effect.
