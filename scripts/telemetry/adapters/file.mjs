import fs from 'node:fs';

export async function loadFileSeries(source) {
  if (!source.file) throw new Error('file adapter requires source.file.');
  const parsed = JSON.parse(fs.readFileSync(source.file, 'utf8'));
  const raw = Array.isArray(parsed) ? parsed : parsed.series;
  if (!Array.isArray(raw)) throw new Error('file telemetry must be a JSON array or {"series": [...]}');
  const timestampField = source.timestampField ?? 'timestamp';
  const valueField = source.valueField ?? 'value';
  return {
    samples: raw.map((row) => ({ timestamp: row[timestampField], value: row[valueField] })),
    provenance: { type: 'file', file: source.file, synthetic: source.synthetic === true },
  };
}
