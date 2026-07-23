export type SurvivalView = "severity" | "cpap";

export type SurvivalState = {
  code: string;
  view: SurvivalView;
};

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function normalizeSurvivalState(
  params: Record<string, string | string[] | undefined>,
): SurvivalState {
  const requestedView = first(params.view);
  const requestedCode = first(params.code)?.trim();
  return {
    code: requestedCode || "401.1",
    view: requestedView === "cpap" ? "cpap" : "severity",
  };
}

export function survivalStateToSearch(state: SurvivalState) {
  return new URLSearchParams({ code: state.code, view: state.view }).toString();
}
