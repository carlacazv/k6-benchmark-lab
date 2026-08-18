import { loadDatadogSeries } from '../../telemetry/adapters/datadog.mjs';

export async function loadDatadogSignals(source, signals, window, analysis) {
  const out = {};
  const provenance = {};
  for (const [name, spec] of Object.entries(signals ?? {})) {
    if (!spec.query) throw new Error(`Datadog correlation signal ${name} requires query.`);
    const result = await loadDatadogSeries({
      ...source,
      query: spec.query,
      seriesAggregation: spec.seriesAggregation ?? spec.aggregation ?? 'avg',
    }, {
      window: {
        start: window.queryStart,
        end: window.queryEnd,
      },
    });
    out[name] = result.samples;
    provenance[name] = result.provenance;
  }
  return { signals: out, provenance: { type: 'datadog', synthetic: false, signals: provenance } };
}
