declare module "plotly.js-basic-dist-min" {
  type PlotlyApi = {
    react(
      node: HTMLElement,
      data: unknown[],
      layout: Record<string, unknown>,
      config: Record<string, unknown>,
    ): Promise<unknown>;
  };

  const Plotly: PlotlyApi;
  export default Plotly;
}
