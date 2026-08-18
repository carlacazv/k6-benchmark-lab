import { loadPrometheusSeries } from '../../telemetry/adapters/prometheus.mjs';

export async function loadPrometheusSignals(source, signals, window, analysis) {
  const out = {};
  const provenance = {};
  for (const [name, spec] of Object.entries(signals ?? {})) {
    if (!spec.query) throw new Error(`Prometheus correlation signal ${name} requires query.`);
    const result = await loadPrometheusSeries({
      ...source,
      query: spec.query,
      seriesAggregation: spec.seriesAggregation ?? spec.aggregation ?? 'avg',
    }, {
      window: {
        start: window.queryStart,
        end: window.queryEnd,
        stepSeconds: Number(analysis.bucketSeconds ?? 5),
      },
    });
    out[name] = result.samples;
    provenance[name] = result.provenance;
  }
  return { signals: out, provenance: { type: 'prometheus', synthetic: false, signals: provenance } };
}
