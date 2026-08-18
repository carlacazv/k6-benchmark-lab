# 2. Model baseline, peak, headroom and limit

Use production telemetry when available. For request-driven systems, extract requests/second or business transactions/second over representative weeks and segment by endpoint/operation. A practical baseline is the steady-state central tendency for the relevant business window; peak should come from the high percentile of real traffic or a defensible business forecast.

Do not derive load from “number of users” alone. Convert business behavior into arrival rate: `iterations_per_second = active_users * actions_per_user / observation_window_seconds`. Validate the conversion against telemetry.

- **Baseline**: normal steady traffic used to establish the healthy latency/resource signature.
- **Load/expected peak**: traffic the service is required to sustain.
- **Headroom**: an agreed margin above expected peak used to validate growth/variance; it is a business/capacity decision, not a universal 20% rule.
- **Stress**: controlled increments above expected peak to learn degradation behavior.
- **Breakpoint/limit**: the first point where an SLO, safety guardrail or resource limit is consistently violated. Stop before causing uncontrolled damage.

Prefer arrival-rate executors when throughput is the contract because they use an open workload model and avoid coordinated omission caused by response time throttling the generator. Track `dropped_iterations`: they can mean insufficient generator allocation or SUT degradation.
