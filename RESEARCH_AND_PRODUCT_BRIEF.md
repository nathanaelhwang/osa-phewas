# OSA Association Atlas: research and product brief

**Status:** discovery proposal, not an implementation specification  
**Date:** 2026-07-21

## Executive direction

The strongest concept is not a literal clone of one site. It is:

- Nightingale's compact scan builder for broad exploration;
- FinnGen Risteys's durable, evidence-rich endpoint pages;
- pyPheWAS's linked plot and result-table interactions; and
- PheWeb/GWAS Catalog's search, stable URLs, provenance, and downloads.

The working product should be an **OSA Association Atlas** with two complementary modes:

1. **Explore OSA across a domain:** choose PheDAS, Incidence PheDAS, LabWAS, MedWAS, BehWAS, ProcWAS, or UtilWAS, then inspect a Manhattan plot, volcano plot, forest plot, and synchronized table.
2. **Look up one feature:** search a name, synonym, or code such as `hypertension` or `401.1`, then see that feature's relationship with OSA across contrasts, adjustment models, time windows, and applicable analysis families.

This should be a browser for precomputed aggregate results, not a browser-based analysis runner.

## What is available in this repository

The `website` directory was empty at the start of this discovery pass. The project already contains most of the aggregate result products needed for an atlas.

| Analysis family | Current aggregate product | Approximate shape | Primary estimands |
|---|---|---:|---|
| Prevalence PheDAS | `results/archived results/icd_analysis_v2_results/summary/phewas_results_combined.csv` | 35,303 rows | OR, beta |
| Incidence PheDAS | `results/incwas_results/summary/cox_results_combined.csv` | 28,364 rows | HR |
| LabWAS | `results/archived results/labwas_results/analysis/results_{1yr,5yr}.csv` | 12,460 rows at 1 year | beta, IRR, omnibus statistics |
| MedWAS | `results/archived results/medwas_results/analysis/results_{1yr,5yr}.csv` | 4,425 rows at 1 year | OR, omnibus statistics |
| BehWAS | `results/archived results/behwas_results/analysis/results_all.csv` | 559 rows | OR, beta, omnibus statistics |
| ProcWAS | `results/archived results/procwas_results/analysis/results_{1yr,5yr}.csv` | 875 rows at 1 year | IRR, omnibus statistics |
| UtilWAS | `results/archived results/utilwas_results/analysis/results_{phecode,specialty}_{1yr,5yr}.csv` | 13,708 rows at 1 year | OR, IRR, omnibus statistics |

The existing static plots are useful visual references, but the website should be generated from the aggregate result tables rather than serving the PNGs.

### Important local interpretation constraints

- The reference group is AHI `<5` among sleep-clinic referrals, not a population-level healthy control group.
- Prevalence PheDAS and Incidence PheDAS answer different questions and use OR and HR, respectively.
- M4 adds BMI. M3 versus M4 should remain visible because BMI may be treated as a confounder or part of the causal pathway, depending on the scientific question.
- PheDAS v2 uses L1-shrunk estimates and non-classical intervals. The interface must label this clearly.
- Incidence results include proportional-hazards diagnostic information; violations need a visible warning/filter.
- LabWAS must separate observed laboratory value, ordering rate, and ordering propensity.
- UtilWAS has distinct presence and count-among-present parts that must not be combined into one effect.
- BehWAS is preliminary, the physician/allied UtilWAS overlap is unresolved, and a documented ProcWAS descriptive file is stale. These need release-status badges rather than silent inclusion.
- Adjustment labels are not perfectly interchangeable across families. In particular, Incidence PheDAS M3 includes baseline encounter rate; the UI must resolve each model label through family-specific metadata.
- No sex-, race-, age-, or BMI-stratified association result products were found. Do not offer subgroup controls unless those analyses are produced and approved later.

## Reference-site research

### 1. Nightingale Biomarker-Disease Atlas

[Atlas home](https://research.nightingalehealth.com/atlas) | [Disease-wide plots](https://research.nightingalehealth.com/atlas/disease-wide-association-plots) | [Biomarker-wide plots](https://research.nightingalehealth.com/atlas/biomarker-wide-association-plots) | [Forest plots](https://research.nightingalehealth.com/atlas/forestplots)

Nightingale presents three simple entry points: one biomarker across diseases, one disease across biomarkers, and selected biomarker-disease estimates as a forest plot. The disease-wide builder exposes dataset, biomarker, age strata, endpoint type, significance threshold, occurrence range, and effect-size clipping. The generated Plotly chart uses filled points for significant findings and hollow points for nonsignificant findings; hover exposes the endpoint, event rate, effect estimate, and category. The site supports plot-image and filtered-summary downloads, plus a bulk summary-statistics file.

**Borrow:** the compact scan controls, explicit incident/prevalent distinction, filled/hollow significance encoding, and immediate export actions.

**Improve:** update reactively, synchronize chart and table, preserve selections in the URL, expose confidence intervals and adjusted q-values in hover, and support meaningful drill-down.

### 2. FinnGen Risteys

[Risteys home](https://risteys.finngen.fi/) | [Sleep apnoea endpoint](https://risteys.finngen.fi/endpoints/G6_SLEEPAPNO) | [CPAP endpoint](https://risteys.finngen.fi/endpoints/CPAP)

Risteys is the closest functional analogue for this project. Its OSA page combines endpoint-definition provenance, similar endpoints, case-code composition, prevalence, age and year at first event, cumulative incidence, mortality, endpoint relationships, CodeWAS, and LabWAS. CodeWAS brings diagnoses, procedures, and drugs into one searchable result table; LabWAS treats measurement probability, frequency, and value as distinct signals.

**Borrow:** one durable page per feature, definitions beside results, release/cohort context, and multiple evidence sections on the same page.

**Improve:** replace very long result tables with linked Manhattan/volcano/table views and explicit domain tabs.

### 3. pyPheWAS Explorer

[Explorer walkthrough](https://pyphewas.readthedocs.io/en/latest/explorer_walkthrough.html) | [PheDAS paper](https://doi.org/10.1093/jamiaopen/ooad018)

pyPheWAS links an effect-size plot, volcano plot, and sortable result table. Selecting a phenotype in any view highlights and pins it in all views. It separates FDR, Bonferroni, and nonsignificant results.

**Borrow:** synchronized selections and an explicit distinction between effect magnitude, uncertainty, and statistical significance.

**Do not borrow for the public site:** patient-level model construction or live regression. This repository's public-facing application should only consume approved aggregate outputs.

### 4. FinnGen/PheWeb

[FinnGen PheWeb documentation](https://finngen.gitbook.io/documentation/r10/methods/pheweb) | [PheWeb paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC7754083/)

PheWeb supports search and reciprocal entity navigation: a phenotype page shows a genome-wide scan, while a variant page shows a phenome-wide scan. Tables sit beneath the plots, results can be downloaded, and URLs are shareable.

**Borrow:** durable feature URLs, plot-to-detail navigation, downloadable filtered tables, and keeping the broad scan available while opening detail.

### 5. GWAS Catalog and ExPheWAS

[NHGRI-EBI GWAS Catalog](https://www.ebi.ac.uk/gwas/) | [ExPheWAS](https://exphewas.statgen.org/)

GWAS Catalog provides a typed, synonym-aware search across traits, variants, genes, studies, publications, and regions, backed by stable identifiers and programmatic access. ExPheWAS makes the reciprocal browsing model explicit: browse by gene or by phenotype.

**Borrow:** one global search with typed results, stable identifiers, aliases, configurable tables, and a clear separation between direct entity matches and related evidence.

## Proposed information architecture

### Home: orient and enter

- Short explanation of the cohort, OSA exposure definitions, and association-not-causation framing.
- Global feature/code search.
- Seven analysis-family cards with the number of tested features, effect measure, time direction, and release status.
- A small set of curated example queries such as hypertension, HbA1c, antihypertensive medication, and emergency-department utilization.
- Links to methods, downloads, citation, and release notes.

### Explorer: scan OSA broadly

Recommended route shape:

```text
/explore/:analysis-family?window=5yr&contrast=severe_vs_none&model=m4&view=manhattan
```

Primary controls:

- analysis family;
- window/time direction;
- outcome target or analysis part;
- OSA contrast;
- adjustment model;
- category;
- FDR/Bonferroni/all;
- stable-only;
- minimum N/event count; and
- feature search/highlight.

Primary views:

1. **Manhattan:** feature order on x; `-log10(p)` on y; category color; direction encoded by point shape or a secondary cue; FDR and Bonferroni thresholds.
2. **Volcano:** transformed effect on x and `-log10(p)` on y; brushing or clicking synchronizes with the table.
3. **Forest:** selected or top features with effect and interval; this is the default for BehWAS because it has few endpoints.
4. **Table:** sortable, filterable, column-selectable, and downloadable.

Clicking a point should open a detail drawer without losing the current scan. A second action opens the full feature page. All selections should be URL-addressable.

### Feature page: query one feature deeply

Recommended route shape:

```text
/feature/:analysis-family/:feature-id
```

For `Essential hypertension (PheCode 401.1)`, the page should contain:

- feature name, identifier, category, aliases, and definition;
- a primary-result summary with model and contrast stated in the sentence;
- a prevalence forest plot with ORs and intervals;
- a separate incidence forest plot with HRs and intervals;
- model-attenuation view from M1 through M4;
- severity comparison across Mild, Moderate, and Severe versus None;
- N, case/event counts, q-value, stability, and PH-diagnostic badges where available;
- exact phenotype/cohort/method definition;
- filtered CSV and publication-quality SVG/PNG exports; and
- links back to the source scan with its filters restored.

Search results must distinguish:

- **Direct matches:** the exact disease feature in prevalence, incidence, and care-setting PheCode analyses.
- **Related evidence:** antihypertensive medication classes, blood-pressure-related labs, or procedures.

Related evidence should never be silently treated as the same phenotype.

### Methods, releases, and downloads

- model ladder and covariate definitions;
- exposure and reference definitions;
- time windows, washout, follow-up, and minimum feature thresholds;
- phenotype/code-system provenance;
- multiple-testing families;
- limitations and analysis-status badges;
- release identifier, date, changelog, and citation;
- current-view download and full approved aggregate download.

## Chart semantics by family

| Family | Default detailed effect | Null | Special handling |
|---|---|---:|---|
| Prevalence PheDAS | OR | 1 | Label L1 shrinkage and non-classical intervals |
| Incidence PheDAS | HR | 1 | Display at-risk/events and PH warning |
| LabWAS value | beta | 0 | Keep units/target explicit |
| LabWAS ordering | IRR or ordering-propensity estimate | measure-specific | Separate from measured values |
| MedWAS | OR | 1 | Preserve zero-padded GPI codes and category labels |
| BehWAS | OR or beta | 1 or 0 | Forest-first; avoid mixing binary and continuous axes |
| ProcWAS | IRR | 1 | Label procedure rate and window |
| UtilWAS presence | OR | 1 | Extensive margin |
| UtilWAS count among present | IRR | 1 | Intensive margin; separate plot/table family |

Do not put OR, HR, IRR, beta, correlation, and omnibus statistics on one effect axis. A cross-domain overview can use signed significance or faceting, but detailed views must preserve the original estimand.

## Website-ready data contract

Build a dedicated allowlisted publication exporter. It should read only named aggregate result files and emit curated website payloads; the browser must never read the analysis directories directly.

Suggested association fields:

```text
release_id
analysis_id
feature_id
feature_name
feature_category
code_system
window
time_direction
target
part
care_setting_or_family
contrast
model
estimand
effect_type
effect
ci_low
ci_high
p
neglog10p
q
sig_fdr
sig_bon
unstable
n
n_atrisk
n_events
prevalence
ph_p
multiplicity_family
denominator
source_file
```

Derived display fields:

- `neutral_value`: 1 for OR/HR/IRR and 0 for beta/correlation;
- `plot_effect`: log-transformed ratio or raw beta, never an omnibus statistic;
- `direction`: positive, negative, or omnibus;
- `is_primary`: approved default row for a feature; and
- `p_display`: safe formatting for underflowed p-values.

Create a separate feature registry containing the stable ID, code system, preferred label, aliases, category, units where relevant, definition, and source vocabulary. LOINC and medication display labels must be joined during export. GPI codes must stay strings so leading zeroes are not lost.

Current tables generally contain FDR and Bonferroni significance flags rather than exact adjusted q-values. The exporter should calculate and validate exact adjusted values within the original multiplicity family, or the UI should honestly expose only the available flags. It must not infer one global correction across incompatible result families.

Other website-facing products still needed are per-severity disease counts/prevalence, medication fill prevalence, laboratory distributions, and BehWAS descriptives. Incidence has crude time-bucket rates, while ProcWAS and UtilWAS already have useful descriptive companions. Omnibus rows are non-directional Wald statistics and belong in Manhattan/table views, not on a signed volcano effect axis.

At the current scale, split compressed static payloads by analysis family and fetch one family at a time. That is simpler than introducing a database or API for the first release. Reconsider a backend only if approved payload size or search performance requires it.

## Privacy and publication gate

Only approved aggregate summary statistics can enter `website/public` or any deployable bundle. Explicitly deny all patient/event-level inputs, including cohort files, feature matrices, event stores, fills, windowed utilization, target matrices, follow-up/CPAP patient files, questionnaire-wide data, and clustering embeddings.

The release exporter should fail closed when:

- a file or column is not on the allowlist;
- a patient identifier-like column is present;
- required N/case/event counts are absent for a feature subject to disclosure control;
- a cell is below the institution-approved public threshold;
- a direct or complementary table could reveal a suppressed count;
- the result key is duplicated or required provenance is missing; or
- an analysis is marked preliminary/unresolved but lacks an explicit UI badge.

The current prevalence PheDAS combined output does not include per-feature case counts, so it is not yet sufficient for a public disclosure check. Add those counts or produce an approved suppression join before public deployment. The [UK Biobank public-browser policy](https://www.ukbiobank.ac.uk/media/cukhqxtp/uk-biobank-policy-on-protecting-confidentiality-in-public-browsers-final_.pdf) is a useful external example of aggregate-count controls, but this project must use the threshold and sensitive-phenotype rules approved by its own institution/data owner.

## Recommended phased build

### Phase 0: data contract and release gate

- Freeze the canonical result versions.
- Implement the aggregate allowlist and normalized exporter.
- Build the feature registry and synonyms.
- Add disclosure, schema, uniqueness, and provenance tests.
- Produce a release manifest and validation report.

**Gate:** every visible result is traceable, correctly labeled, and approved for the intended audience. Prevalence PheDAS has usable disclosure counts.

### Phase 1: disease vertical slice

- Home shell and global search.
- Prevalence and Incidence PheDAS explorers.
- Manhattan, volcano, forest, and synchronized table.
- Point detail drawer and a full hypertension feature page.
- URL-persisted state and current-view CSV/SVG/PNG export.
- Methods and release pages.

**Gate:** a user can search hypertension, distinguish prevalence from incidence, compare M1-M4 and severity contrasts, see warnings, reproduce a filtered view by URL, and download only approved rows.

### Phase 2: extend the shared schema

- Add LabWAS, MedWAS, ProcWAS, and UtilWAS.
- Add BehWAS with a forest-first layout.
- Add direct-versus-related search results across code systems.
- Add model-attenuation and prevalence-versus-incidence comparison views.

**Gate:** every family uses correct estimand-specific labeling and every result links to its definition and method.

### Phase 3: advanced comparison and communication

- Pin and compare several features.
- Cross-domain heatmaps or signed-significance summaries.
- Selected incidence curves where approved aggregate data exist.
- Full approved downloads and, only if needed, a documented API.

**Gate:** advanced views add insight without merging incompatible estimands or weakening disclosure controls.

## Recommended first implementation choices

- **Working title:** OSA Association Atlas.
- **First scientific slice:** Prevalence PheDAS + Incidence PheDAS, with hypertension as the acceptance-test feature.
- **Default adjusted view:** M4, while keeping M3 one click away and explaining the BMI interpretation.
- **Default pairwise contrast:** Severe versus None; expose trend alongside it.
- **Frontend direction:** a static TypeScript application with Plotly for linked scientific charts and family-split aggregate payloads. Do not add a server until the data or deployment requirements justify one.
- **Default language:** “associated with,” never “caused by,” “protective,” or “risk factor” without an explicitly causal design.

## Decisions to settle before implementation

1. Is the first deployment internal-only, authenticated, or public?
2. Which result versions under `archived results` are formally canonical for release?
3. What public minimum-count and sensitive-feature policy has the institution/data owner approved?
4. Should M4 or M3 be the default scientific view, given BMI's possible confounder/mediator role?
5. Should the primary contrast be Severe versus None or the ordinal severity trend?
6. What brand/name and visual tone should the atlas use?
7. Which aggregate counts may be shown exactly, rounded, or suppressed?

The first three decisions are release blockers. The remaining decisions can be refined during design without changing the underlying data contract.
