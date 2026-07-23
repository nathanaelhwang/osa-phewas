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

## Aggregate Incidence PheDAS curve export

Export the plot-ready cumulative-incidence curves separately:

```powershell
python .\scripts\export_survival_data.py
```

The exporter reads only four fixed, allowlisted aggregate files in
`results/incwas_results/survival_curves`: the source README, the FDR feature
list, and the severity- and CPAP-stratified curve CSVs. It never reads
`survival_long.parquet` and has no source-path option. Exact schemas, feature
joins, group and panel labels, the monthly time grid, numeric ranges,
monotonicity, source curve thresholds, and source hashes are validated before
any website file is written.

Outputs are:

- `survival-manifest.json`, which records provenance, estimand and stratum
  semantics, disclosure status, feature paths, and the default feature.
- `survival/{phecode}.json`, one columnar severity and CPAP curve payload per
  FDR-significant PheCode.

Browser JSON contains only `time_years` and aggregate Aalen-Johansen
`cif_pct` curve values. Exact feature-level and timepoint risk/event counts are
validated internally but withheld pending institutional disclosure review.
Risk tables and downloads therefore remain disabled. CPAP curves are
descriptive, not causal; the shared No-OSA reference is stored once in the
severity section and reused across CPAP severity panels.
