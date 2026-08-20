# Browser smoke policy

The browser adapter uses one iteration by default when `SCENARIO=smoke` and two iterations for other scenarios unless `BROWSER_ITERATIONS` is explicitly set.

This keeps PR smoke inexpensive and avoids treating cleanup time from a second browser iteration as missing capacity evidence. A dropped browser iteration remains a failure signal; the analyzer is intentionally not relaxed.

Use `BROWSER_ITERATIONS` explicitly when a deeper browser sample is required, and increase `BROWSER_MAX_DURATION` when the expected number of browser iterations cannot fit inside the default execution window.
