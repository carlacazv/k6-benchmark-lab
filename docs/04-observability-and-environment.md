# 4. Instrumentation and environment parity

A k6 graph can prove that latency changed; it usually cannot prove why. Before load, inventory instrumentation and environment topology.

## Application telemetry
Collect RED metrics per service/operation (rate, errors, duration), logs with correlation IDs, distributed traces, dependency latency/error rate, queue depth, DB pool/connection metrics, cache hit ratio, runtime metrics (event loop/threads/GC) and autoscaling events.

## Infrastructure evidence
Record production and test: CPU/memory requests and limits, machine/instance type, replicas, autoscaling min/max/targets, database class/storage/IOPS, connection pool settings, cache size, network/LB topology, container limits, dependency quotas and dataset size.

If test and production differ, document the difference before interpreting capacity. Twelve-factor principles are applied here through env-based configuration, explicit dependencies, stdout logs, stateless test processes and minimizing dev/test/prod divergence.
