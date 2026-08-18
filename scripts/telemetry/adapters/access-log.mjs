import fs from 'node:fs';

export function aggregateAccessLogLines(lines, source, stepSeconds) {
  const timestampField = source.timestampField ?? 'timestamp';
  const filterField = source.operationFilterField;
  const filterValue = source.operationFilterValue;
  const counts = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (filterField && String(row[filterField]) !== String(filterValue)) continue;
    const ts = Date.parse(row[timestampField]);
    if (!Number.isFinite(ts)) continue;
    const bucketMs = stepSeconds * 1000;
    const bucket = Math.floor(ts / bucketMs) * bucketMs;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([timestamp, count]) => ({ timestamp: new Date(timestamp).toISOString(), value: count / stepSeconds }));
}

export async function loadAccessLogSeries(source, config) {
  if (!source.file) throw new Error('access-log adapter requires source.file.');
  const stepSeconds = Number(config.window?.stepSeconds ?? 60);
  const lines = fs.readFileSync(source.file, 'utf8').split(/\r?\n/);
  return {
    samples: aggregateAccessLogLines(lines, source, stepSeconds),
    provenance: { type: 'access-log', file: source.file, filter: source.operationFilterField ? `${source.operationFilterField}=${source.operationFilterValue}` : null },
  };
}
