# OSA Association Atlas

Research-facing explorer for aggregate associations between obstructive sleep
apnea (OSA) severity and the clinical phenome. It includes Prevalence PheDAS,
Incidence PheDAS, LabWAS, MedWAS, BehWAS, ProcWAS, and UtilWAS. Every
non-disease family carries its archived, preliminary, or review status in the
interface. Incidence PheDAS also includes interactive Aalen–Johansen cumulative-
incidence curves for its FDR-selected outcomes, stratified by OSA severity and
landmark CPAP adherence designed to address immortal-time bias. A dedicated Phenotypes section
describes eight cross-domain octants and their incident-outcome curves.

The primary presentation is **M4 / Severe vs None**. “None” means AHI `<5`
within the sleep-clinic referral cohort.

## Run locally

Requires Node.js `>=22.13.0`.

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. Key routes are:

- `/` — atlas overview and feature search
- `/explore` — interactive Manhattan, volcano, and table views
- `/phenotypes` — octant construction, clinical signatures, and phenotype-exposure survival findings
- `/survival` — cumulative-incidence curves by OSA severity or landmark CPAP adherence
- `/was` — estimand-separated laboratory, medication, behavior, procedure, and utilization scans
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
python .\scripts\export_survival_data.py
python .\scripts\export_phenotype_data.py
```

See [scripts/README.md](scripts/README.md) for the exporter contract. The
exporter fails closed on unexpected or identifier-like columns and never emits
patient-level data.

## Public release scope

This is an IRB-approved public research release of aggregate results and
publication figures. Exact exposure-by-outcome cells remain unavailable for
several WAS families, so the interface does not infer them or enable raw result
downloads. The survival exporter validates monthly at-risk and event arrays
internally but intentionally omits those count arrays from browser JSON.
