function lcg(seed) {
  let state = Number(seed || 7) >>> 0;
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
}

export async function loadSyntheticSeries(source, config) {
  const stepSeconds = Number(config.window?.stepSeconds ?? 3600);
  const days = Number(config.window?.days ?? 14);
  const count = Math.floor((days * 86400) / stepSeconds);
  const start = Date.parse(source.start ?? '2026-08-01T00:00:00Z');
  const random = lcg(source.seed ?? 7);
  const samples = [];
  for (let i = 0; i < count; i += 1) {
    const timestamp = start + i * stepSeconds * 1000;
    const date = new Date(timestamp);
    const hour = date.getUTCHours();
    const weekday = date.getUTCDay();
    let value = Number(source.baseRate ?? 34);
    if (hour >= 8 && hour < 12) value += 16;
    if (hour >= 12 && hour < 18) value += 34;
    if (hour >= 18 && hour < 21) value += 20;
    if (weekday === 0 || weekday === 6) value *= 0.72;
    value += 6 * Math.sin(i / 7) + (random() * 8 - 4);
    const eventDayOffset = Number(source.eventDayOffset ?? 8);
    const eventStartHour = Number(source.eventStartHour ?? 14);
    const dayOffset = Math.floor((timestamp - start) / 86400000);
    if (dayOffset === eventDayOffset && hour >= eventStartHour && hour < eventStartHour + 3) value += 115 + (hour - eventStartHour) * 8;
    samples.push({ timestamp: new Date(timestamp).toISOString(), value: Number(Math.max(1, value).toFixed(2)) });
  }
  return { samples, provenance: { type: 'synthetic', seed: Number(source.seed ?? 7), synthetic: true } };
}
