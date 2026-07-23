# OSA Association Atlas

Research-facing explorer for aggregate associations between obstructive sleep
apnea (OSA) severity and the clinical phenome. It includes Prevalence PheDAS,
Incidence PheDAS, LabWAS, MedWAS, BehWAS, ProcWAS, and UtilWAS. Every
non-disease family carries its archived, preliminary, or review status in the
interface. Incidence PheDAS also includes interactive Aalen–Johansen cumulative-
incidence curves for its FDR-selected outcomes, stratified by OSA severity and
recorded CPAP usage.

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
- `/survival` — cumulative-incidence curves by OSA severity or recorded CPAP usage
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
```

See [scripts/README.md](scripts/README.md) for the exporter contract. The
exporter fails closed on unexpected or identifier-like columns and never emits
patient-level data.

## Release gate

This is a local research preview. Prevalence PheDAS does not currently include
cases and non-cases for each PheCode within the OSA severity or contrast groups.
Overall analytic N cannot identify a rare outcome cell or support complementary
disclosure checks. A version-matched count companion and institution-approved
suppression decision are required before publishing the data files or enabling
downloads. Several other families also have only overall feature counts rather
than the complete exposure-by-outcome cells, so the same release gate applies.
The survival exporter validates monthly at-risk and event arrays internally but
does not copy them into browser JSON while disclosure policy remains pending.
