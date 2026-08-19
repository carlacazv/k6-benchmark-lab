import fs from 'node:fs';

export async function loadFileSignals(source, signals, window) {
  if (!source.path) throw new Error('file correlation adapter requires source.path.');
  const payload = JSON.parse(fs.readFileSync(source.path, 'utf8'));
  const out = {};
  const startMs = Date.parse(window.queryStart);
  const endMs = Date.parse(window.queryEnd);
  for (const name of Object.keys(signals ?? {})) {
    const raw = payload?.signals?.[name];
    if (!Array.isArray(raw)) throw new Error(`file correlation source is missing signals.${name}.`);
    out[name] = raw.filter((sample) => {
      const ts = Date.parse(sample.timestamp);
      return Number.isFinite(ts) && ts >= startMs && ts <= endMs;
    });
  }
  return { signals: out, provenance: { type: 'file', path: source.path, synthetic: false } };
}
