export function scheduledInterventionValue({
  configuredValue,
  startAfterMs = 0,
  durationMs = 0,
  workloadStartedAt = null,
  nowMs = Date.now(),
}) {
  const value = Number(configuredValue);
  const startAfter = Math.max(0, Number(startAfterMs) || 0);
  const duration = Math.max(0, Number(durationMs) || 0);
  if (!Number.isFinite(value)) throw new Error('configuredValue must be finite.');
  if (duration === 0) return value;
  if (workloadStartedAt === null || workloadStartedAt === undefined || !Number.isFinite(Number(workloadStartedAt))) return 0;
  const elapsed = Number(nowMs) - Number(workloadStartedAt);
  return elapsed >= startAfter && elapsed < startAfter + duration ? value : 0;
}
