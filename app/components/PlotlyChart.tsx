"use client";

import { useEffect, useRef } from "react";

type PlotlyChartProps = {
  data: unknown[];
  layout: Record<string, unknown>;
  ariaLabel: string;
  className?: string;
  onPointClick?: (point: Record<string, unknown>) => void;
  allowImageExport?: boolean;
};

type PlotlyClickEvent = {
  points?: Record<string, unknown>[];
};

export function PlotlyChart({
  data,
  layout,
  ariaLabel,
  className = "atlas-plot",
  onPointClick,
  allowImageExport = true,
}: PlotlyChartProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const node = ref.current as (HTMLDivElement & {
      on?: (event: string, handler: (event: PlotlyClickEvent) => void) => void;
      removeAllListeners?: (event: string) => void;
    }) | null;
    if (!node) return;

    import("plotly.js-basic-dist-min").then(({ default: Plotly }) => {
      if (cancelled) return;
      Plotly.react(node, data, layout, {
        responsive: true,
        displaylogo: false,
        scrollZoom: false,
        modeBarButtonsToRemove: [
          "lasso2d",
          "select2d",
          ...(allowImageExport ? [] : ["toImage"]),
        ],
        toImageButtonOptions: { format: "svg", filename: "osa-association-atlas" },
      }).then(() => {
        node.removeAllListeners?.("plotly_click");
        if (onPointClick) {
          node.on?.("plotly_click", (event) => {
            const point = event?.points?.[0];
            if (point) onPointClick(point);
          });
        }
      });
    });

    return () => {
      cancelled = true;
      node.removeAllListeners?.("plotly_click");
    };
  }, [allowImageExport, data, layout, onPointClick]);

  return <div ref={ref} className={className} role="img" aria-label={ariaLabel} />;
}
