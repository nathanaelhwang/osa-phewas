import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataRoot = new URL("../public/data/", import.meta.url);
let workerPromise;

async function getWorker() {
  if (!workerPromise) {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
    workerPromise = import(workerUrl.href).then(({ default: worker }) => worker);
  }
  return workerPromise;
}

async function render(pathname) {
  const worker = await getWorker();
  const response = await worker.fetch(
    new Request(new URL(pathname, "http://localhost"), {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  return response.text();
}

async function readJson(pathname) {
  return JSON.parse(await readFile(new URL(pathname, dataRoot), "utf8"));
}

function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:x27|39);|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function assertSelectedOption(html, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    html,
    new RegExp(
      `<option(?=[^>]*\\bvalue=["']${escaped}["'])(?=[^>]*\\bselected(?:=["'][^"']*["'])?)[^>]*>`,
      "i",
    ),
  );
}

function assertNoStarterPreview(html) {
  assert.doesNotMatch(
    html,
    /codex-preview|Your site is taking shape|Codex is working|Codex is building|Starter Project|react-loading-skeleton/i,
  );
}

function assertColumnLengths(columns, required, expectedLength) {
  for (const name of required) {
    assert.ok(Array.isArray(columns[name]), `missing column: ${name}`);
    assert.equal(
      columns[name].length,
      expectedLength,
      `${name} must contain ${expectedLength} values`,
    );
  }
}

const wasAnalyses = [
  "labwas_mean",
  "labwas_median",
  "labwas_order_rate",
  "labwas_order_propensity",
  "medwas_fill",
  "behwas_binary",
  "behwas_continuous",
  "procwas_rate",
  "utilwas_presence",
  "utilwas_count_present",
  "utilwas_specialty_rate",
];

function manifestAnalysisId(analysis) {
  return typeof analysis === "string" ? analysis : analysis.analysis_id ?? analysis.id;
}

function partitionMetadata(partition, payload = {}) {
  return {
    ...partition,
    ...(partition.metadata ?? {}),
    ...(payload.metadata ?? {}),
  };
}

function publicDataPath(pathname) {
  return pathname.replaceAll("\\", "/").replace(/^\/?data\//, "");
}

function nestedKeys(value, keys = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => nestedKeys(item, keys));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      keys.push(key);
      nestedKeys(item, keys);
    }
  }
  return keys;
}

function assertMonotoneCurveColumns(columns, seriesFields, label) {
  const previous = new Map();
  const seen = new Set();
  for (let index = 0; index < columns.time_years.length; index += 1) {
    const series = seriesFields.map((field) => columns[field][index]).join("|");
    const time = columns.time_years[index];
    const cif = columns.cif_pct[index];
    assert.ok(Number.isFinite(time) && time >= 0 && time <= 6, `${label}: invalid time`);
    assert.ok(Number.isFinite(cif) && cif >= 0 && cif <= 100, `${label}: invalid CIF`);
    const pointKey = `${series}|${time}`;
    assert.equal(seen.has(pointKey), false, `${label}: duplicate series/time point`);
    seen.add(pointKey);
    const prior = previous.get(series);
    if (prior) {
      assert.ok(time >= prior.time, `${label}: time is not monotone for ${series}`);
      assert.ok(cif + 1e-10 >= prior.cif, `${label}: CIF is not monotone for ${series}`);
    }
    previous.set(series, { time, cif });
  }
}

test("server-renders the researcher-facing atlas home", async () => {
  const html = await render("/");
  const text = visibleText(html);

  assert.match(html, /<title>OSA Association Atlas<\/title>/i);
  assert.match(text, /How is obstructive sleep apnea associated with the clinical phenome\?/i);
  assert.match(text, /M4\s*[Â··]\s*Severe vs None/i);
  assert.match(text, /sleep-clinic referral cohort/i);
  assert.match(text, /do not estimate population OSA prevalence or establish causality/i);
  assert.match(text, /Search diseases, labs, medications, behaviors, procedures, and utilization/i);
  assert.match(html, /href=["']\/survival\?code=401\.1&amp;view=severity["']/i);
  assert.match(html, /href=["']\/phenotypes["']/i);
  assertNoStarterPreview(html);
});

test("server-renders the cumulative-incidence explorer with a safe default", async () => {
  const html = await render("/survival");
  const text = visibleText(html);

  assert.match(text, /Cumulative incidence after index/i);
  assert.match(text, /Aalen[–-]Johansen/i);
  assert.match(text, /death competing/i);
  assert.match(text, /descriptive and unadjusted/i);
  assert.match(text, /Aggregate cumulative-incidence percentages are public/i);
  assertSelectedOption(html, "401.1");
  assert.match(text, /Essential hypertension/i);
  assert.match(html, /<button(?=[^>]*aria-pressed=["']true["'])[^>]*>OSA severity<\/button>/i);
  assert.doesNotMatch(html, /<th[^>]*>\s*(?:At risk|Events)\s*<\/th>/i);
  assertNoStarterPreview(html);
});

test("server-renders the landmark CPAP state with immortal-time and confounding context", async () => {
  const html = await render("/survival?code=291.8&view=cpap&window=180");
  const text = visibleText(html);

  assertSelectedOption(html, "291.8");
  assert.match(text, /Alteration of consciousness/i);
  assert.match(html, /<button(?=[^>]*aria-pressed=["']true["'])[^>]*>Landmark CPAP adherence<\/button>/i);
  assert.match(text, /180 days[·\s]+primary/i);
  assert.match(text, /addresses immortal-time bias[—-]not confounding/i);
  assert.match(text, /healthy-adherer confounding remains/i);
  assert.match(text, /device was set up but usage was not captured/i);
  assertNoStarterPreview(html);
});

test("server-renders the enriched octant profile subpage", async () => {
  const html = await render("/phenotypes");
  const text = visibleText(html);

  assert.match(html, /<title>Octant phenotypes · OSA Association Atlas<\/title>/i);
  assert.match(html, /<a(?=[^>]*href=["']\/phenotypes["'])(?=[^>]*aria-current=["']page["'])[^>]*>/i);
  assert.match(html, /href=["']\/phenotypes\/outcomes["']/i);
  assert.match(text, /Profiles & clusters/i);
  assert.match(text, /Outcome panels 168/i);
  assert.match(text, /Three near-independent axes\. Eight octant phenotypes\./i);
  assert.match(text, /70,880 people/i);
  assert.match(text, /Physiologic severity/i);
  assert.match(text, /Symptom burden/i);
  assert.match(text, /Comorbidity burden/i);
  assert.match(text, /Mild All/i);
  assert.match(text, /26 of 26 measures/i);
  assert.match(text, /Find a measure/i);
  assert.match(html, /placeholder=["']Try hypertension, BMI, or sleepiness["']/i);
  assert.match(text, /FOSQ impairment/i);
  assert.match(text, /Hyperlipidemia/i);
  assert.match(text, /Impaired fasting glucose/i);
  assert.match(text, /IncWAS follow-up/i);
  assert.match(text, /Coverage/i);
  assert.match(text, /Compare all eight phenotypes in native units/i);
  assert.match(text, /containing cohort/i);
  assert.match(text, /Pairwise Spearman correlations/i);
  assert.match(text, /Continue to the incident-outcome panels/i);
  assert.doesNotMatch(text, /Look up any gated phenotype–outcome panel/i);
  assert.doesNotMatch(text, /Loading interactive curve/i);
  assert.match(html, /\/images\/phenotypes\/octant-construction\.png/i);
  assertNoStarterPreview(html);
});

test("server-renders the dedicated phenotype outcome subpage", async () => {
  const html = await render("/phenotypes/outcomes");
  const text = visibleText(html);

  assert.match(html, /<title>Phenotype outcome panels · OSA Association Atlas<\/title>/i);
  assert.match(html, /<a(?=[^>]*href=["']\/phenotypes\/outcomes["'])(?=[^>]*aria-current=["']page["'])[^>]*>/i);
  assert.match(text, /Outcome panels without the long scroll\./i);
  assert.match(text, /Panels 168 one-vs-rest M4 models/i);
  assert.match(text, /Interactive curves 152 16 disclosure-withheld/i);
  assert.match(text, /Octant-exposure Incidence PheDAS/i);
  assert.match(text, /Look up any gated phenotype–outcome panel/i);
  assert.match(text, /PheCode outcomes · 120/i);
  assert.match(text, /Body-system outcomes · 48/i);
  assert.match(text, /All gated/i);
  assert.match(text, /Bonferroni/i);
  assert.match(text, /Search outcomes/i);
  assert.match(text, /120 of 120 panels/i);
  assert.match(text, /0\.05\/15/i);
  assert.match(text, /Curve: unadjusted Aalen–Johansen cumulative incidence/i);
  assert.match(text, /Thin 3-year tail/i);
  assert.match(text, /PH diagnostic · not evaluated/i);
  assert.match(text, /Loading interactive curve/i);
  assert.doesNotMatch(text, /Why the full trajectory is still a figure/i);
  assertNoStarterPreview(html);
});

test("server-renders the circular OSA-recoding control with an explicit warning", async () => {
  const html = await render("/survival?code=327.3&view=severity");
  const text = visibleText(html);

  assertSelectedOption(html, "327.3");
  assert.match(text, /Sleep apnea/i);
  assert.match(text, /Methodological control/i);
  assert.match(text, /circular OSA-recoding phenotype/i);
  assert.match(text, /should not be interpreted as an incident disease finding/i);
});

test("server-normalizes unsafe curve query state without constructing a data path", async () => {
  const html = await render("/survival?code=..%2Fnot-a-feature&view=invalid");
  const text = visibleText(html);

  assertSelectedOption(html, "401.1");
  assert.match(html, /<button(?=[^>]*aria-pressed=["']true["'])[^>]*>OSA severity<\/button>/i);
  assert.doesNotMatch(text, /\.\.\/not-a-feature/i);
});

test("server-renders explicit explorer query state and disclosure controls", async () => {
  const html = await render(
    "/explore?analysis=incidence&contrast=trend&model=m3&view=table&significance=fdr&feature=401.1",
  );
  const text = visibleText(html);

  assert.match(text, /Incidence PheDAS/i);
  assert.match(text, /New disease onset during post-index follow-up/i);
  assertSelectedOption(html, "incidence");
  assertSelectedOption(html, "trend");
  assertSelectedOption(html, "M3");
  assertSelectedOption(html, "fdr");
  assert.match(
    html,
    /<button(?=[^>]*\baria-pressed=["']true["'])[^>]*>Table<\/button>/i,
  );
  assert.match(text, /Prevalence downloads remain unavailable pending per-feature disclosure review/i);
  assert.match(html, /disabled[^>]*title=["']Pending disclosure review["']/i);
  assertNoStarterPreview(html);
});

test("server-renders the hypertension feature with separate prevalence and incidence evidence", async () => {
  const html = await render("/feature?code=401.1");
  const text = visibleText(html);

  assert.match(text, /PheCode 401\.1/i);
  assert.match(text, /Primary presentation Severe vs None/i);
  assert.match(text, /Prevalence PheDAS Odds ratio/i);
  assert.match(text, /Incidence PheDAS Hazard ratio/i);
  assert.match(text, /M4 is emphasized as the primary presentation model/i);
  assert.match(text, /Public data downloads remain disabled pending approved disclosure checks/i);
  assert.match(text, /Association, not causation/i);
  assert.match(text, /do not measure population OSA prevalence/i);
  assertNoStarterPreview(html);
});

test("server-renders the generic cross-domain feature route", async () => {
  const registry = await readJson("was-features.json");
  const index = registry.columns.family.findIndex((family) => family === "medwas");
  assert.ok(index >= 0, "the registry must contain a MedWAS feature");
  const featureKey = registry.columns.feature_key[index];
  const featureId = registry.columns.feature_id[index];
  const html = await render(
    `/feature?family=medwas&key=${encodeURIComponent(featureKey)}&window=1yr&contrast=severe_vs_none`,
  );
  const text = visibleText(html);

  assert.match(text, /Cross-domain feature/i);
  assert.match(text, /Other WAS analyses/i);
  assert.match(text, /Primary presentation M4/i);
  assert.match(text, new RegExp(featureId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(text, /Prevalence PheDAS Odds ratio/i);
  assertNoStarterPreview(html);
});

for (const route of [
  {
    family: "labwas",
    analysis: "labwas_mean",
    label: /LabWAS\s*[Ã‚Â··]\s*mean observed value/i,
    question: /mean observed laboratory values differ/i,
    view: "Manhattan",
  },
  {
    family: "medwas",
    analysis: "medwas_fill",
    label: /MedWAS\s*[Ã‚Â··]\s*medication fill/i,
    question: /medication classes are filled/i,
    view: "Manhattan",
  },
  {
    family: "behwas",
    analysis: "behwas_binary",
    label: /BehWAS\s*[Ã‚Â··]\s*binary behavior/i,
    question: /binary EHR-derived behaviors differ/i,
    view: "Forest",
  },
  {
    family: "procwas",
    analysis: "procwas_rate",
    label: /ProcWAS\s*[Ã‚Â··]\s*procedure rate/i,
    question: /procedure rates differ/i,
    view: "Manhattan",
  },
  {
    family: "utilwas",
    analysis: "utilwas_presence",
    label: /UtilWAS\s*[Ã‚Â··]\s*any use/i,
    question: /presence of healthcare use differ/i,
    view: "Manhattan",
  },
  {
    family: "utilwas",
    analysis: "utilwas_count_present",
    label: /UtilWAS\s*[Ã‚Â··]\s*count among users/i,
    question: /among people with use.*utilization counts differ/i,
    view: "Manhattan",
  },
]) {
  test(`server-renders the ${route.analysis} WAS explorer state`, async () => {
    const html = await render(
      `/was?family=${route.family}&analysis=${route.analysis}&window=1yr&model=m4&contrast=severe_vs_none`,
    );
    const text = visibleText(html);

    assert.match(text, route.label);
    assert.match(text, route.question);
    assertSelectedOption(html, route.family);
    assertSelectedOption(html, route.analysis);
    assert.match(text, /M4 and Severe vs None are the primary defaults where available/i);
    assert.match(text, /Model IDs retain their family-specific source definitions/i);
    assert.match(text, /unlike effect measures never share an axis/i);
    assert.match(
      html,
      new RegExp(
        `<button(?=[^>]*\\baria-pressed=["']true["'])[^>]*>${route.view}<\\/button>`,
        "i",
      ),
    );
    assert.match(text, /Family-specific release and disclosure status remains visible above each scan/i);
    assertNoStarterPreview(html);
  });
}

test("server-normalizes omnibus WAS requests to non-directional views", async () => {
  const html = await render(
    "/was?analysis=labwas_mean&window=1yr&model=m4&contrast=omnibus&view=forest",
  );
  const text = visibleText(html);

  assert.match(
    html,
    /<button(?=[^>]*\baria-pressed=["']true["'])[^>]*>Manhattan<\/button>/i,
  );
  assert.match(
    html,
    /<button(?=[^>]*\bdisabled(?:=["'][^"']*["'])?)(?=[^>]*title=["']This non-directional analysis supports Manhattan and table views only["'])[^>]*>Volcano<\/button>/i,
  );
  assert.match(
    html,
    /<button(?=[^>]*\bdisabled(?:=["'][^"']*["'])?)(?=[^>]*title=["']This non-directional analysis supports Manhattan and table views only["'])[^>]*>Forest<\/button>/i,
  );
  assert.match(text, /Omnibus\s*[Ã‚Â··]\s*non-directional/i);
});

test("feature index has a stable, searchable hypertension record", async () => {
  const payload = await readJson("features.json");
  const { columns, metadata } = payload;
  const required = [
    "feature_id",
    "feature_name",
    "category",
    "prevalence",
    "incidence",
    "alternate_names",
  ];

  assert.equal(payload.schema_version, 1);
  assert.ok(Number.isInteger(metadata.row_count) && metadata.row_count > 0);
  assertColumnLengths(columns, required, metadata.row_count);
  assert.equal(new Set(columns.feature_id).size, metadata.row_count);

  const essentialIndices = columns.feature_id
    .map((id, index) => (id === "401.1" ? index : -1))
    .filter((index) => index >= 0);
  assert.deepEqual(essentialIndices.length, 1);

  const index = essentialIndices[0];
  assert.equal(columns.feature_name[index], "Essential hypertension");
  assert.equal(columns.prevalence[index], true);
  assert.equal(columns.incidence[index], true);

  const searchable = [
    columns.feature_id[index],
    columns.feature_name[index],
    columns.category[index],
    ...(columns.alternate_names[index] ?? []),
  ]
    .join(" ")
    .toLowerCase();
  assert.match(searchable, /hypertension/);
  assert.match(searchable, /401\.1/);
});

test("survival manifest and curve payloads are complete, monotone, and count-free", async () => {
  const manifest = await readJson("survival-manifest.json");
  const prohibitedKeys = new Set([
    "n_atrisk",
    "n_at_risk",
    "n_events",
    "n_events_cum",
    "event_count",
    "case_count",
    "participant_count",
  ]);

  assert.equal(manifest.schema_version, 2);
  assert.deepEqual(
    { feature: manifest.defaults.feature_id, view: manifest.defaults.view },
    { feature: "401.1", view: "severity" },
  );
  assert.equal(manifest.features.length, 40);
  assert.equal(new Set(manifest.features.map((feature) => feature.feature_id)).size, 40);
  assert.equal(new Set(manifest.features.map((feature) => feature.path)).size, 40);
  assert.deepEqual(
    manifest.features.filter((feature) => feature.osa_control).map((feature) => feature.feature_id),
    ["327.3"],
  );
  assert.equal(manifest.disclosure.counts_disclosure_status, "withheld_from_public_release");
  assert.equal(manifest.disclosure.risk_table_available, false);
  assert.equal(manifest.disclosure.downloads_enabled, false);
  assert.equal(manifest.disclosure.public_release_allowed, true);
  assert.deepEqual(manifest.strata.cpap_window_order, [180, 90]);
  assert.deepEqual(manifest.strata.cpap_group_order, [
    "4+ hr/night",
    "2-4 hr/night",
    "0-2 hr/night",
    "never-started",
    "unknown",
  ]);
  assert.equal(manifest.counts.feature_count, 40);

  for (const feature of manifest.features) {
    assert.match(feature.path, /^survival\/[0-9]+(?:\.[0-9]+)*\.json$/);
    assert.doesNotMatch(feature.path, /^(?:[a-z]:[\\/]|[\\/]{1,2}|(?:https?|file):)/i);
    assert.equal(feature.path.includes(".."), false);
  }
  const manifestText = JSON.stringify(manifest);
  assert.doesNotMatch(manifestText, /survival_long|\.parquet|(?:[a-z]:\\)|(?:https?|file):\/\//i);
  assert.deepEqual(
    [...new Set(nestedKeys(manifest).filter((key) => prohibitedKeys.has(key)))],
    [],
  );

  const loaded = [];
  for (const feature of manifest.features) {
    const payload = await readJson(feature.path);
    loaded.push(payload);
    assert.equal(payload.schema_version, 2);
    assert.equal(payload.metadata.feature_id, feature.feature_id);
    assert.equal(payload.metadata.feature_name, feature.feature_name);
    assert.equal(payload.metadata.osa_control, feature.osa_control);
    assert.equal(payload.metadata.counts_disclosure_status, "withheld_from_public_release");
    assert.equal(payload.metadata.risk_table_available, false);
    assert.equal(payload.metadata.downloads_enabled, false);
    assert.deepEqual(
      Object.keys(payload.severity.columns).sort(),
      ["cif_pct", "group", "time_years"],
    );
    assert.deepEqual(
      Object.keys(payload.cpap.columns).sort(),
      ["cif_pct", "group", "time_years", "window_days"],
    );
    assertColumnLengths(
      payload.severity.columns,
      ["group", "time_years", "cif_pct"],
      payload.severity.row_count,
    );
    assertColumnLengths(
      payload.cpap.columns,
      ["window_days", "group", "time_years", "cif_pct"],
      payload.cpap.row_count,
    );
    assertMonotoneCurveColumns(
      payload.severity.columns,
      ["group"],
      `${feature.feature_id} severity`,
    );
    assertMonotoneCurveColumns(
      payload.cpap.columns,
      ["window_days", "group"],
      `${feature.feature_id} CPAP`,
    );
    assert.deepEqual(
      [...new Set(payload.severity.columns.group)].sort(),
      ["Mild", "Moderate", "No OSA", "Severe"],
    );
    assert.deepEqual([...new Set(payload.cpap.columns.window_days)].sort((a, b) => a - b), [90, 180]);
    const allowedCpapGroups = new Set(manifest.strata.cpap_group_order);
    assert.equal(
      [...new Set(payload.cpap.columns.group)].every((group) => allowedCpapGroups.has(group)),
      true,
    );
    assert.equal(payload.cpap.columns.group.includes("never-started"), true);
    assert.equal(payload.cpap.columns.group.includes("No OSA"), false);
    assert.ok(payload.severity.columns.group.includes("No OSA"));
    assert.deepEqual(
      [...new Set(nestedKeys(payload).filter((key) => prohibitedKeys.has(key)))],
      [],
      `${feature.feature_id} exposes a prohibited count key`,
    );
  }

  const sparse = loaded.find((payload) => payload.metadata.feature_id === "327.41");
  assert.ok(sparse, "missing PheCode 327.41 curve payload");
  const suppliedPairs = [...new Set(sparse.cpap.columns.window_days.map(
    (windowDays, index) => `${windowDays}|${sparse.cpap.columns.group[index]}`,
  ))].sort();
  assert.deepEqual(suppliedPairs, [
    "180|never-started",
    "90|never-started",
    "90|unknown",
  ].sort());
  assert.deepEqual(
    sparse.cpap.omitted_strata.map(({ window_days, group }) => `${window_days}|${group}`).sort(),
    [
      "180|0-2 hr/night",
      "180|2-4 hr/night",
      "180|4+ hr/night",
      "180|unknown",
      "90|0-2 hr/night",
      "90|2-4 hr/night",
      "90|4+ hr/night",
    ].sort(),
  );
});

test("phenotype release contains enriched clusters and disclosure-safe interactive curves", async () => {
  const phenotype = await readJson("phenotypes.json");
  const serialized = JSON.stringify(phenotype);

  assert.equal(phenotype.schema_version, 2);
  assert.equal(phenotype.release.status, "public_research_release");
  assert.equal(phenotype.construction.shared_cohort_n, 70_880);
  assert.equal(phenotype.construction.classification_coverage_pct, 100);
  assert.deepEqual(phenotype.construction.axis_order, ["physiologic", "symptom", "comorbidity"]);
  assert.equal(phenotype.octants.length, 8);
  assert.equal(phenotype.octants.reduce((sum, octant) => sum + octant.n, 0), 70_880);
  assert.deepEqual(
    phenotype.octants.map((octant) => octant.glyph),
    ["□□□", "■□□", "□■□", "□□■", "■■□", "■□■", "□■■", "■■■"],
  );
  assert.equal(phenotype.octants.every((octant) => octant.n >= 11), true);

  assert.equal(phenotype.cluster_profiles.metrics.length, 26);
  assert.equal(new Set(phenotype.cluster_profiles.metrics.map((metric) => metric.id)).size, 26);
  for (const metric of phenotype.cluster_profiles.metrics) {
    assert.equal(Object.keys(metric.by_octant).length, 8);
    assert.equal(metric.overall.standardized_difference, 0);
    for (const summary of [metric.overall, ...Object.values(metric.by_octant)]) {
      assert.ok(summary.n_nonmissing >= 11);
      assert.ok(summary.coverage_pct > 0 && summary.coverage_pct <= 100);
      assert.equal(summary.suppressed, false);
      if (metric.metric_type === "binary") {
        assert.ok(summary.numerator >= 11 && summary.denominator >= 11);
      } else {
        assert.ok(Number.isFinite(summary.mean));
        assert.ok(Number.isFinite(summary.median));
      }
    }
  }

  assert.deepEqual(
    phenotype.survival.levels.map((level) => [level.id, level.panel_count, level.outcomes.length]),
    [["phecode", 120, 15], ["system", 48, 6]],
  );
  assert.deepEqual(phenotype.survival.scope, {
    panel_count: 168,
    outcome_count: 21,
    phecode_panels: 120,
    system_panels: 48,
    fdr_panels: 31,
    bonferroni_panels: 21,
    curve_panels_available: 152,
    curve_panels_withheld: 16,
  });
  assert.match(phenotype.survival.testing.bonferroni, /0\.05\/15/);
  assert.match(phenotype.survival.testing.bonferroni, /0\.05\/6/);
  assert.match(phenotype.survival.testing.bonferroni, /not across 168/i);

  const assetPaths = [];
  let availablePanels = 0;
  let withheldPanels = 0;
  let unstablePanels = 0;
  let fdrPanels = 0;
  let bonferroniPanels = 0;
  for (const level of phenotype.survival.levels) {
    for (const outcome of level.outcomes) {
      assert.match(outcome.asset_path, new RegExp(`^data/phenotype-survival/${level.id}/[a-z0-9-]+\\.json$`));
      assetPaths.push(outcome.asset_path);
      assert.equal(outcome.panels.length, 8);
      const asset = await readJson(outcome.asset_path.replace(/^data\//, ""));
      assert.equal(asset.schema_version, 1);
      assert.equal(asset.level, level.id);
      assert.equal(asset.outcome_id, outcome.outcome_id);
      assert.equal(asset.panels.length, 8);

      for (const panel of outcome.panels) {
        assert.equal(panel.ph_p, null);
        assert.equal(panel.currently_published, panel.sig_bon);
        assert.ok(panel.n_focal >= 11 && panel.n_rest >= 11);
        assert.ok(panel.events_focal === null || panel.events_focal >= 11);
        assert.ok(panel.events_rest === null || panel.events_rest >= 11);
        assert.ok(panel.ci_low > 0 && panel.ci_low <= panel.hr_m4 && panel.hr_m4 <= panel.ci_high);
        assert.ok(panel.cif3_focal_pct >= 0 && panel.cif3_focal_pct <= 100);
        assert.ok(panel.cif3_rest_pct >= 0 && panel.cif3_rest_pct <= 100);
        unstablePanels += panel.unstable === "epv<10" ? 1 : 0;
        fdrPanels += panel.sig_fdr ? 1 : 0;
        bonferroniPanels += panel.sig_bon ? 1 : 0;

        const curvePanel = asset.panels.find((candidate) => candidate.octant === panel.octant);
        assert.ok(curvePanel, `missing curve panel for ${level.id} ${outcome.outcome_id} ${panel.octant}`);
        for (const group of ["focal", "other_seven"]) {
          const riskRows = curvePanel.risk_table[group];
          assert.deepEqual(riskRows.map((row) => row.time_years), [0, 1, 2, 3]);
          assert.ok(riskRows.every((row) => row.n_at_risk >= 11));
          assert.ok(riskRows.every((row) => row.suppressed === (row.n_events_cum === null)));
          assert.ok(riskRows.every((row) => row.n_events_cum === null || row.n_events_cum >= 11));
        }

        if (panel.suppressed) {
          withheldPanels += 1;
          assert.equal(panel.curve_available, false);
          assert.equal(curvePanel.curve_status, "withheld_event_count_suppression");
          assert.equal(curvePanel.curves, null);
        } else {
          availablePanels += 1;
          assert.equal(panel.curve_available, true);
          assert.equal(curvePanel.curve_status, "available");
          for (const group of ["focal", "other_seven"]) {
            const series = curvePanel.curves[group];
            assert.equal(series.time_years.length, 120);
            assert.equal(series.cif_pct.length, 120);
            assert.equal(series.time_years[0], 0);
            assert.equal(series.time_years.at(-1), 3);
            assert.ok(series.time_years.every((value, index, values) => index === 0 || value > values[index - 1]));
            assert.ok(series.cif_pct.every((value) => value >= 0 && value <= 100));
            assert.ok(series.cif_pct.every((value, index, values) => index === 0 || value >= values[index - 1] - 1e-10));
          }
          assert.ok(Math.abs(curvePanel.curves.focal.cif_pct.at(-1) - panel.cif3_focal_pct) <= 0.00005);
          assert.ok(Math.abs(curvePanel.curves.other_seven.cif_pct.at(-1) - panel.cif3_rest_pct) <= 0.00005);
        }
      }
    }
  }
  assert.equal(new Set(assetPaths).size, 21);
  assert.equal(availablePanels, 152);
  assert.equal(withheldPanels, 16);
  assert.equal(unstablePanels, 80);
  assert.equal(fdrPanels, 31);
  assert.equal(bonferroniPanels, 21);
  assert.doesNotMatch(
    serialized,
    /octant_assignments|cross_domain_phenotypes|(?:[a-z]:\\)|(?:https?|file):\/\/|\bmrn\b/i,
  );
});

test("manifest defaults and every public association partition satisfy the schema", async () => {
  const manifest = await readJson("atlas-manifest.json");
  const commonColumns = [
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
  ];

  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.release.audience, "researchers");
  assert.deepEqual(manifest.models, ["M1", "M2", "M3", "M4"]);
  assert.deepEqual(
    {
      analysis: manifest.defaults.analysis,
      model: manifest.defaults.model,
      contrast: manifest.defaults.contrast,
    },
    { analysis: "prevalence", model: "M4", contrast: "severe_vs_none" },
  );
  assert.ok(manifest.partitions.length > 0);
  assert.equal(
    new Set(manifest.partitions.map((partition) => partition.path)).size,
    manifest.partitions.length,
  );

  const loaded = await Promise.all(
    manifest.partitions.map(async (partition) => {
      assert.match(
        partition.path,
        /^phedas\/(?:prevalence|incidence)\/m[1-4]\/[a-z0-9_]+\.json$/,
      );
      const payload = await readJson(partition.path);
      const { columns, metadata } = payload;

      assert.equal(payload.schema_version, 1);
      assert.equal(metadata.analysis, partition.analysis);
      assert.equal(metadata.model, partition.model);
      assert.equal(metadata.contrast, partition.contrast);
      assert.equal(metadata.effect_type, partition.effect_type);
      assert.equal(metadata.row_count, partition.row_count);
      assertColumnLengths(columns, commonColumns, partition.row_count);
      assert.equal(new Set(columns.feature_id).size, partition.row_count);
      assert.ok(
        columns.effect_type.every((effectType) => effectType === partition.effect_type),
        `${partition.path} contains a mismatched effect type`,
      );

      if (partition.analysis === "prevalence") {
        assert.equal(partition.effect_type, "OR");
      } else {
        assert.equal(partition.effect_type, "HR");
        assertColumnLengths(
          columns,
          ["n_atrisk", "n_events", "ph_p", "unstable_reason"],
          partition.row_count,
        );
      }

      return { partition, columns };
    }),
  );

  for (const analysis of ["prevalence", "incidence"]) {
    const primary = loaded.find(
      ({ partition }) =>
        partition.analysis === analysis &&
        partition.model === "M4" &&
        partition.contrast === "severe_vs_none",
    );
    assert.ok(primary, `missing ${analysis} M4 severe-vs-none partition`);
    assert.ok(
      primary.columns.feature_id.includes("401.1"),
      `${analysis} primary partition must include Essential hypertension`,
    );
  }
});

test("WAS manifest and every partition preserve estimand and release boundaries", async (t) => {
  let manifest;
  try {
    manifest = await readJson("was-manifest.json");
  } catch (error) {
    if (error?.code === "ENOENT") {
      t.skip("WAS exporter artifacts have not been generated yet");
      return;
    }
    throw error;
  }

  const analysisIds = manifest.analyses.map(manifestAnalysisId);
  assert.deepEqual([...new Set(analysisIds)].sort(), [...wasAnalyses].sort());
  assert.equal(analysisIds.length, wasAnalyses.length);
  assert.deepEqual(manifest.defaults, {
    analysis_id: "labwas_mean",
    window: "1yr",
    model: "M4",
    contrast: "severe_vs_none",
    partition_path: "was/labwas_mean/1yr/m4/severe_vs_none.json",
  });
  assert.ok(Array.isArray(manifest.partitions) && manifest.partitions.length > 0);
  assert.equal(
    new Set(manifest.partitions.map((partition) => partition.path)).size,
    manifest.partitions.length,
  );

  const requiredColumns = [
    "feature_key",
    "feature_id",
    "feature_name",
    "category",
    "subgroup",
    "effect_type",
    "effect",
    "se",
    "ci_low",
    "ci_high",
    "p",
    "neglog10p",
    "sig_fdr",
    "sig_bon",
    "unstable",
    "unstable_reason",
    "n",
    "n_secondary",
    "prevalence",
    "label_review_required",
  ];
  const loaded = [];

  for (const partition of manifest.partitions) {
    assert.equal(typeof partition.path, "string");
    assert.doesNotMatch(
      partition.path,
      /^(?:[a-z]:[\\/]|[\\/]{1,2}|(?:https?|file):)/i,
      `absolute public-data path: ${partition.path}`,
    );
    assert.equal(partition.path.includes(".."), false, `unsafe path: ${partition.path}`);

    const payload = await readJson(publicDataPath(partition.path));
    const metadata = partitionMetadata(partition, payload);
    const { columns } = payload;
    const rowCount = metadata.row_count;

    assert.ok(wasAnalyses.includes(metadata.analysis_id), metadata.analysis_id);
    assert.equal(typeof metadata.family, "string");
    assert.equal(typeof metadata.label, "string");
    assert.equal(typeof metadata.window, "string");
    assert.equal(typeof metadata.model, "string");
    assert.equal(typeof metadata.contrast, "string");
    assert.equal(typeof metadata.effect_type, "string");
    assert.equal(typeof metadata.effect_scale, "string");
    assert.equal(typeof metadata.neutral_value, "number");
    assert.equal(typeof metadata.directional, "boolean");
    assert.equal(typeof metadata.code_system, "string");
    assert.equal(typeof metadata.release_status, "string");
    assert.equal(typeof metadata.release_note, "string");
    assert.ok(Number.isInteger(rowCount) && rowCount >= 0);
    assertColumnLengths(columns, requiredColumns, rowCount);
    for (const [column, values] of Object.entries(columns)) {
      assert.ok(Array.isArray(values), `${partition.path}: ${column} is not an array`);
      assert.equal(values.length, rowCount, `${partition.path}: ${column} is misaligned`);
    }
    assert.equal(new Set(columns.feature_key).size, rowCount);
    assert.ok(columns.feature_key.every((value) => typeof value === "string" && value.length > 0));
    assert.ok(columns.feature_id.every((value) => typeof value === "string"));
    assert.ok(columns.effect_type.every((value) => value === metadata.effect_type));

    const effectType = metadata.effect_type.toLowerCase();
    const effectScale = metadata.effect_scale.toLowerCase();
    if (["or", "hr", "irr"].includes(effectType) || effectScale === "ratio") {
      assert.equal(metadata.neutral_value, 1, `${partition.path}: ratio null must be 1`);
    }
    if (["beta", "β"].includes(effectType) || effectScale === "difference") {
      assert.equal(metadata.neutral_value, 0, `${partition.path}: difference null must be 0`);
    }
    if (metadata.contrast.toLowerCase().includes("omnibus")) {
      assert.equal(metadata.directional, false, `${partition.path}: omnibus must be non-directional`);
    }

    loaded.push({ partition, metadata, columns });
  }

  assert.deepEqual(
    [...new Set(loaded.map(({ metadata }) => metadata.analysis_id))].sort(),
    [...wasAnalyses].sort(),
  );

  for (const analysisId of wasAnalyses) {
    const analysisPartitions = loaded.filter(
      ({ metadata }) => metadata.analysis_id === analysisId,
    );
    assert.ok(analysisPartitions.length > 0, `missing partitions for ${analysisId}`);
    const primary = analysisPartitions.filter(
      ({ metadata }) => metadata.model.toUpperCase() === "M4" &&
        metadata.contrast === "severe_vs_none",
    );
    assert.ok(primary.length > 0, `${analysisId} lacks an M4 Severe-vs-None primary partition`);

    const directionalEffectTypes = new Set(
      analysisPartitions
        .filter(({ metadata }) => metadata.directional)
        .map(({ metadata }) => metadata.effect_type.toLowerCase()),
    );
    assert.equal(
      directionalEffectTypes.size,
      1,
      `${analysisId} mixes directional effect types`,
    );

    const omnibusEffectTypes = new Set(
      analysisPartitions
        .filter(({ metadata }) => !metadata.directional)
        .map(({ metadata }) => metadata.effect_type.toLowerCase()),
    );
    assert.ok(
      omnibusEffectTypes.size <= 1,
      `${analysisId} mixes omnibus statistics`,
    );
  }

  const expectedEffectTypes = {
    labwas_mean: "beta",
    labwas_median: "beta",
    medwas_fill: "or",
    behwas_binary: "or",
    behwas_continuous: "beta",
    procwas_rate: "irr",
    utilwas_presence: "or",
    utilwas_count_present: "irr",
    utilwas_specialty_rate: "irr",
  };
  for (const [analysisId, expected] of Object.entries(expectedEffectTypes)) {
    const observed = new Set(
      loaded
        .filter(({ metadata }) => metadata.analysis_id === analysisId && metadata.directional)
        .map(({ metadata }) => metadata.effect_type.toLowerCase()),
    );
    assert.deepEqual([...observed], [expected], `${analysisId} estimand changed`);
  }

  for (const analysisId of ["labwas_mean", "labwas_median", "behwas_continuous"]) {
    const observed = new Set(
      loaded
        .filter(({ metadata }) => metadata.analysis_id === analysisId && metadata.directional)
        .map(({ metadata }) => metadata.effect_scale),
    );
    assert.deepEqual(
      [...observed],
      ["rank-inverse-normal standard-deviation beta"],
      `${analysisId} must identify its standardized beta scale`,
    );
  }

  const warningAnalyses = new Set([
    "behwas_binary",
    "behwas_continuous",
    "procwas_rate",
    "utilwas_specialty_rate",
  ]);
  for (const { metadata, partition } of loaded) {
    if (!warningAnalyses.has(metadata.analysis_id)) continue;
    assert.ok(metadata.release_note.trim(), `${partition.path}: missing release warning`);
    assert.doesNotMatch(
      metadata.release_status,
      /^(?:available|approved|ready|validated)$/i,
      `${partition.path}: warning analysis marked release-ready`,
    );
  }

  const medicationIds = loaded
    .filter(({ metadata }) => metadata.analysis_id === "medwas_fill")
    .flatMap(({ columns }) => columns.feature_id);
  assert.ok(medicationIds.length > 0);
  assert.ok(medicationIds.every((value) => typeof value === "string"));
  assert.ok(
    medicationIds.some((value) => /^0\d+/.test(value)),
    "MedWAS must retain at least one zero-padded GPI identifier",
  );
});

test("cross-domain feature registry is aligned, namespaced, and searchable", async () => {
  const payload = await readJson("was-features.json");
  const { columns, metadata } = payload;
  const required = [
    "feature_key",
    "feature_id",
    "feature_name",
    "family",
    "analysis_ids",
    "category",
    "subgroup",
    "code_system",
    "alternate_names",
    "windows",
    "label_review_required",
  ];

  assert.equal(payload.schema_version, 1);
  assert.ok(Number.isInteger(metadata.row_count) && metadata.row_count > 0);
  assertColumnLengths(columns, required, metadata.row_count);
  assert.equal(new Set(columns.feature_key).size, metadata.row_count);
  assert.ok(columns.feature_key.every((value) => typeof value === "string" && value.includes(":")));
  assert.ok(columns.feature_id.every((value) => typeof value === "string"));
  assert.ok(columns.analysis_ids.every((value) => Array.isArray(value) && value.length > 0));
  assert.ok(columns.windows.every(Array.isArray));
  assert.ok(columns.label_review_required.every((value) => typeof value === "boolean"));
  assert.deepEqual(
    [...new Set(columns.family)].sort(),
    ["behwas", "labwas", "medwas", "procwas", "utilwas"],
  );
  assert.ok(
    columns.family.some((family, index) => family === "medwas" && /^0\d+/.test(columns.feature_id[index])),
    "registry must retain a zero-padded medication identifier",
  );
});
