export function summaryOutputs(data, meta) {
  const dir = __ENV.K6_REPORT_DIR || 'artifacts/manual';
  const envelope = { meta: { ...meta, generatedAt: new Date().toISOString(), apdexTMs: Number(__ENV.APDEX_T_MS || 500), apdexMin: Number(__ENV.APDEX_MIN || 0.85) }, ...data };
  return {
    [`${dir}/summary.json`]: JSON.stringify(envelope, null, 2),
    stdout: `\n[k6-benchmark-lab] ${meta.protocol}/${meta.scenario} summary -> ${dir}/summary.json\n`,
  };
}
