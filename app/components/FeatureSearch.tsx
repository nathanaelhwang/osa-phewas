"use client";

import { useId, useMemo, useRef, useState, useEffect } from "react";
import {
  fetchSearchFeatures,
  searchFeatureMatches,
  type SearchFeatureRecord,
} from "../atlas-data";
import { WAS_FAMILY_LABELS, type WasFamily } from "../was-config";

type FeatureSearchProps = { compact?: boolean };

function familyLabel(feature: SearchFeatureRecord) {
  return feature.family === "phedas"
    ? "PheDAS"
    : WAS_FAMILY_LABELS[feature.family as WasFamily];
}

function matchRank(feature: SearchFeatureRecord, query: string) {
  const values = [feature.feature_id, feature.feature_name, ...feature.alternate_names]
    .map((value) => value.toLowerCase());
  if (values.some((value) => value === query)) return 0;
  if (values.some((value) => value.startsWith(query))) return 1;
  return 2;
}

export function FeatureSearch({ compact = false }: FeatureSearchProps) {
  const [features, setFeatures] = useState<SearchFeatureRecord[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchId = useId().replaceAll(":", "");
  const inputId = `${compact ? "compact" : "atlas"}-feature-search-${searchId}`;
  const listId = `${inputId}-results`;
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetchSearchFeatures()
      .then((items) => { if (active) setFeatures(items); })
      .catch(() => { if (active) setFeatures([]); });
    return () => { active = false; };
  }, []);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return features
      .filter((feature) => searchFeatureMatches(feature, normalized))
      .sort((a, b) => {
        const rank = matchRank(a, normalized) - matchRank(b, normalized);
        if (rank) return rank;
        const name = a.feature_name.localeCompare(b.feature_name);
        return name || familyLabel(a).localeCompare(familyLabel(b));
      })
      .slice(0, 8);
  }, [features, query]);

  const selectedIndex = matches.length ? Math.min(activeIndex, matches.length - 1) : -1;
  const choose = (feature: SearchFeatureRecord) => {
    if (feature.source === "phedas" || feature.family === "phedas") {
      window.location.href = `/feature?code=${encodeURIComponent(feature.feature_id)}`;
      return;
    }
    const params = new URLSearchParams({ family: feature.family, key: feature.feature_key });
    window.location.href = `/feature?${params.toString()}`;
  };

  return (
    <div
      ref={wrapperRef}
      className={`feature-search ${compact ? "feature-search--compact" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label htmlFor={inputId}>
        {compact ? "Find another feature" : "Search diseases, labs, medications, behaviors, procedures, and utilization"}
      </label>
      <div className="feature-search__control">
        <span className="search-glyph" aria-hidden="true">⌕</span>
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-activedescendant={open && selectedIndex >= 0 ? `${listId}-${selectedIndex}` : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => matches.length ? (current + 1) % matches.length : 0);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => matches.length ? (current - 1 + matches.length) % matches.length : 0);
            } else if (event.key === "Enter" && matches[selectedIndex]) {
              event.preventDefault();
              choose(matches[selectedIndex]);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
          placeholder="Try hypertension, HbA1c, statin, or a feature code"
        />
        <button
          type="button"
          disabled={!matches[selectedIndex]}
          onClick={() => matches[selectedIndex] && choose(matches[selectedIndex])}
        >
          View feature
        </button>
      </div>
      {open && matches.length > 0 ? (
        <ul id={listId} className="search-results" role="listbox" aria-label="Feature matches">
          {matches.map((feature, index) => (
            <li
              id={`${listId}-${index}`}
              key={`${feature.family}:${feature.feature_key}`}
              role="option"
              aria-selected={index === selectedIndex}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(feature)}
              >
                <span className="search-result__identity">
                  <strong>{feature.feature_name}</strong>
                  <small>{feature.category}{feature.subgroup ? ` · ${feature.subgroup}` : ""}</small>
                </span>
                <span className="search-result__meta">
                  <span className="search-result__badges">
                    <span>{familyLabel(feature)}</span>
                    <span>{feature.code_system}</span>
                  </span>
                  <code>{feature.feature_id}</code>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && query.trim() && features.length > 0 && matches.length === 0 ? (
        <p className="search-results-empty" role="status">No matching aggregate feature was found.</p>
      ) : null}
      {!compact ? (
        <p className="feature-search__hint">Results identify the analysis family and coding system before opening evidence.</p>
      ) : null}
    </div>
  );
}
