export type SurvivalView = "severity" | "cpap";
export type LandmarkWindow = 90 | 180;

export type SurvivalState = {
  code: string;
  view: SurvivalView;
  windowDays: LandmarkWindow;
};

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function normalizeSurvivalState(
  params: Record<string, string | string[] | undefined>,
): SurvivalState {
  const requestedView = first(params.view);
  const requestedCode = first(params.code)?.trim();
  const requestedWindow = Number(first(params.window));
  return {
    code: requestedCode || "401.1",
    view: requestedView === "cpap" || requestedView === "landmark_cpap" ? "cpap" : "severity",
    windowDays: requestedWindow === 90 ? 90 : 180,
  };
}

export function survivalStateToSearch(state: SurvivalState) {
  const params = new URLSearchParams({ code: state.code, view: state.view });
  if (state.view === "cpap") params.set("window", String(state.windowDays));
  return params.toString();
}
