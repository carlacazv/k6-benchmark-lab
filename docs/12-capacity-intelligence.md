# 12. Capacity intelligence and interpretation

Telemetry discovery answers **what demand was observed**. Readiness answers **whether this experiment is safe and representative**. k6 answers **how the target behaved under the selected workload**. Diagnosis answers **what hypotheses are consistent with the evidence**.

Do not collapse these into one number.

## Normal demand vs exceptional events

A detected interval above the robust event threshold is not automatically discarded. It is separated so the team can label it as a legitimate recurring business event, a rare campaign with forecast, a retry storm/incident, or a telemetry anomaly.

## Feedback loop

After a real test:

1. compare generated arrival rate with the discovery profile;
2. inspect `dropped_iterations` and actual iteration duration;
3. recalibrate preallocated/max VUs;
4. compare saturation signatures with PRD telemetry;
5. update the performance plan only when evidence or business requirements changed.

The lab intentionally does not auto-edit the committed performance plan. It emits `plan-volume-suggestion.yaml` for review.
