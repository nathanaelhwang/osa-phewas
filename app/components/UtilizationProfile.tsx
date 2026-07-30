"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchWasUtilizationProfile,
  type WasUtilizationMetricId,
  type WasUtilizationProfilePayload,
  type WasUtilizationProfileRef,
  type WasUtilizationProfileRow,
  type WasUtilizationSeverity,
} from "../was-data";

const severityOrder: WasUtilizationSeverity[] = ["Overall", "None", "Mild", "Moderate", "Severe"];
const encounterMetrics: WasUtilizationMetricId[] = [
  "outpatient_rate",
  "inpatient_rate",
  "ed_rate",
  "urgent_care_rate",
  "primary_care_rate",
  "specialty_rate",
];
const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function windowLabel(window: string) {
  return window === "5yr" ? "5-year pre-index" : "1-year pre-index";
}

function formatStatistic(value: number | null) {
  if (value === null) return "—";
  if (value >= 100) return value.toFixed(1);
  if (value >= 0.1) return value.toFixed(2);
  return value.toFixed(3);
}

function compactCount(value: number) {
  return compactNumber.format(value);
}

function ProfileCell({ row }: { row?: WasUtilizationProfileRow }) {
  if (!row || row.suppressed || row.mean === null || row.sd === null) {
    return <span className="utilization-profile__unavailable">Not released</span>;
  }
  const countLabel = row.metric_id === "hospital_los_days"
    ? `${row.n_nonmissing.toLocaleString()} admissions with LOS`
    : `${row.n_with_use.toLocaleString()} patients with use`;
  return (
    <span
      className="utilization-profile__estimate"
      title={`${countLabel}; median ${formatStatistic(row.median)} ${row.unit}`}
    >
      <strong>{formatStatistic(row.mean)}</strong>
      <span>± {formatStatistic(row.sd)}</span>
      <small>{compactCount(row.metric_id === "hospital_los_days" ? row.n_nonmissing : row.n_with_use)} contributing</small>
    </span>
  );
}

function MetricRow({
  metricId,
  rows,
}: {
  metricId: WasUtilizationMetricId;
  rows: Map<string, WasUtilizationProfileRow>;
}) {
  const first = rows.get(`${metricId}|Overall`);
  if (!first) return null;
  return (
    <tr>
      <th scope="row">
        <strong>{first.metric_label}</strong>
        <span>{first.unit}</span>
      </th>
      {severityOrder.map((severity) => (
        <td key={severity} className={severity === "Overall" ? "is-overall" : undefined}>
          <ProfileCell row={rows.get(`${metricId}|${severity}`)} />
        </td>
      ))}
    </tr>
  );
}

export function UtilizationProfile({
  profileRef,
  manifestLoading,
  window,
}: {
  profileRef?: WasUtilizationProfileRef;
  manifestLoading: boolean;
  window: string;
}) {
  const [payload, setPayload] = useState<WasUtilizationProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profileRef) return;
    let active = true;
    fetchWasUtilizationProfile(profileRef)
      .then((nextPayload) => {
        if (active) setPayload(nextPayload);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "The utilization profile could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [profileRef]);

  const windowRows = useMemo(() => {
    const lookup = new Map<string, WasUtilizationProfileRow>();
    for (const row of payload?.rows ?? []) {
      if (row.window === window) lookup.set(`${row.metric_id}|${row.severity}`, row);
    }
    return lookup;
  }, [payload, window]);
  const cohortCounts = severityOrder.map((severity) =>
    windowRows.get(`outpatient_rate|${severity}`)?.n_denominator,
  );
  const primaryCare = payload?.metadata.primary_care_specialty_list.join(", ");
  const isPending = manifestLoading || (Boolean(profileRef) && loading);

  return (
    <section className="utilization-profile" aria-labelledby="utilization-profile-title">
      <div className="utilization-profile__heading">
        <div>
          <span className="section-kicker">Descriptive care-use context</span>
          <h2 id="utilization-profile-title">Utilization profile</h2>
          <p>Mean ± SD across OSA severity strata. Rates include patients with no qualifying visits.</p>
        </div>
        <span className="utilization-profile__window">{windowLabel(window)}</span>
      </div>

      {error ? <div className="plot-error" role="alert">{error}</div> : null}
      {!error && isPending ? <div className="utilization-profile__loading" role="status">Loading utilization profile…</div> : null}
      {!error && !isPending && !profileRef ? <div className="plot-error">This profile is unavailable in the current release.</div> : null}
      {!error && payload ? (
        <>
          <div className="utilization-profile__table-wrap">
            <table>
              <caption className="sr-only">Mean and standard deviation of healthcare utilization by OSA severity</caption>
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  {severityOrder.map((severity, index) => (
                    <th key={severity} scope="col" className={severity === "Overall" ? "is-overall" : undefined}>
                      <strong>{severity}</strong>
                      {cohortCounts[index] !== undefined ? <span>N = {cohortCounts[index]!.toLocaleString()}</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="utilization-profile__group"><th colSpan={6}>Encounter rates</th></tr>
                {encounterMetrics.map((metricId) => <MetricRow key={metricId} metricId={metricId} rows={windowRows} />)}
                <tr className="utilization-profile__group"><th colSpan={6}>Stay duration</th></tr>
                <MetricRow metricId="hospital_los_days" rows={windowRows} />
              </tbody>
            </table>
          </div>
          <div className="utilization-profile__notes">
            <p><strong>Rate denominator.</strong> Distinct encounters per observed person-year, including zero-use patients. Hospital LOS is summarized per qualifying admission.</p>
            <p><strong>Care groups.</strong> Primary care includes {primaryCare}; specialty care is the complementary approved outpatient-specialty group, excluding exact Urgent Care.</p>
            <p><strong>Overlap.</strong> ED and inpatient categories intentionally share ED-to-inpatient encounter subtypes and should not be added as mutually exclusive totals.</p>
          </div>
        </>
      ) : null}
    </section>
  );
}
