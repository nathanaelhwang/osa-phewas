# OSA Association Atlas

Research-facing explorer for aggregate associations between obstructive sleep
apnea (OSA) severity and the clinical phenome. It includes Prevalence PheDAS,
Incidence PheDAS, LabWAS, MedWAS, BehWAS, ProcWAS, UtilWAS, and QWAS. Every
non-disease family carries its archived, preliminary, or review status in the
interface. Incidence PheDAS also includes interactive Aalen–Johansen cumulative-
incidence curves for its FDR-selected outcomes, stratified by OSA severity and
landmark CPAP adherence designed to address immortal-time bias. A dedicated Phenotypes section
describes eight cross-domain octants with 26 aggregate cluster measures and a
searchable 168-panel phenotype-exposure survival explorer. Each selected
outcome can compare every disclosure-safe octant curve with a directly
estimated full-cohort reference or return to the focal-versus-rest contrast.

The primary presentation is **M4 / Severe vs None**. “None” means AHI `<5`
within the sleep-clinic referral cohort.

QWAS is an index-anchored, cross-sectional scan of the closest questionnaire on
or before the sleep-study index. It presents binary questionnaire responses as
odds ratios and ordinal or continuous responses as rank-inverse-normal
standard-deviation betas.

## Run locally

Requires Node.js `>=22.13.0`.

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. Key routes are:

- `/` — atlas overview and feature search
- `/explore` — interactive Manhattan, volcano, and table views
- `/phenotypes` — enriched octant profiles and cluster comparisons
- `/phenotypes/outcomes` — searchable outcome panels with all-phenotype and focal-versus-rest cumulative-incidence views
- `/survival` — cumulative-incidence curves by OSA severity or landmark CPAP adherence
- `/was` — estimand-separated laboratory, medication, behavior, procedure, utilization, and questionnaire scans
- `/feature?code=401.1` — combined disease evidence for a PheCode, or a namespaced non-disease feature report
- `/methods` — methods, interpretation, and release status

## Validate

```powershell
npm run lint
npm test
npm run build:vercel
```

`npm test` creates the production build, checks rendered routes, validates the
hypertension lookup, and checks every public association partition.
`npm run build:vercel` validates the standard Next.js build used by the public
Vercel deployment; the existing `npm run build` command remains the Sites build.

## Aggregate data export

The browser consumes only allowlisted, columnar JSON under `public/data/`.
Regenerate the disease and non-disease payloads with:

```powershell
python .\scripts\export_disease_data.py
python .\scripts\export_multiwas_data.py
python .\scripts\export_qwas_data.py
python .\scripts\export_utilization_profile.py
python .\scripts\export_survival_data.py
python .\scripts\export_phenotype_data.py
```

This order is intentional: the strict QWAS exporter augments the multi-WAS
manifest and feature registry, so it must run after `export_multiwas_data.py`.
The utilization-profile exporter also requires that manifest to exist.

See [scripts/README.md](scripts/README.md) for the exporter contract. The
exporter fails closed on unexpected or identifier-like columns and never emits
patient-level data.

## Public release scope

This is an IRB-approved public research release of aggregate results and
publication figures. Exact exposure-by-outcome cells remain unavailable for
several WAS families, so the interface does not infer them or enable raw result
downloads. The survival exporter validates monthly at-risk and event arrays
internally but intentionally omits those count arrays from the OSA-severity and
landmark-CPAP browser JSON. The separate octant export includes disclosure-
controlled annual risk tables; exact counts below 11 are null, never zero. The
pooled reference withholds all cumulative-event totals to prevent complementary
reconstruction of rare focal counts.

The QWAS release contains aggregate association summaries and feature metadata
only. Its estimates are itemwise complete-case; displayed answered counts must
not be interpreted as model-specific fitted counts after covariate missingness.
Items that can contribute to sleep-clinic referral are marked as
ascertainment-sensitive, and instrument-item concept labels remain provisional
where validated public wording was unavailable.
