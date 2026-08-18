# 5. Analyze results and Apdex

Start with the acceptance criteria: p95/p99, error rate, throughput achieved, dropped iterations and recovery. Then correlate with resource and application telemetry. Averages are supporting data, not a release gate.

## Apdex
For response-time use, classify samples with threshold `T`: satisfied `<= T`, tolerating `> T and <= 4T`, and frustrated `> 4T` or failed. Score = `(Satisfied + Tolerating/2) / Total`. Choose T from the user/business expectation; do not tune T after seeing the result to make the score look good.

This lab writes explicit satisfied/tolerating/frustrated counters so the pipeline can calculate Apdex exactly. The configured `APDEX_MIN` is a project gate, not part of the Apdex standard.

## Diagnosis discipline
The generated report uses heuristics to create hypotheses (for example TTFB-dominated latency, tail amplification, connection/TLS overhead or dropped iterations). A hypothesis is not root cause until application metrics/logs/traces support it.
