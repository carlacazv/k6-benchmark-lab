import fs from 'node:fs';

export function aggregateAccessLogLines(lines, source, stepSeconds) {
  const timestampField = source.timestampField ?? 'timestamp';
  const filterField = source.operationFilterField;
  const filterValue = source.operationFilterValue;
  const counts = new Map();
  let minBucket = null;
  let maxBucket = null;
  const bucketMs = stepSeconds * 1000;
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const ts = Date.parse(row[timestampField]);
    if (!Number.isFinite(ts)) continue;
    const bucket = Math.floor(ts / bucketMs) * bucketMs;
    minBucket = minBucket === null ? bucket : Math.min(minBucket, bucket);
    maxBucket = maxBucket === null ? bucket : Math.max(maxBucket, bucket);
    if (filterField && String(row[filterField]) !== String(filterValue)) continue;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  if (minBucket === null || maxBucket === null) return [];
  const samples = [];
  for (let bucket = minBucket; bucket <= maxBucket; bucket += bucketMs) {
    samples.push({ timestamp: new Date(bucket).toISOString(), value: (counts.get(bucket) ?? 0) / stepSeconds });
  }
  return samples;
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
