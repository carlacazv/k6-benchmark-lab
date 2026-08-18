# 3. Choose the scenario by the question

| Scenario | Question | Typical use |
|---|---|---|
| smoke | Is the script and environment valid? | every PR / preflight |
| baseline | What does healthy steady state look like? | establish comparison signature |
| load | Can we meet NFRs at required peak? | release/capacity gate |
| stress | How does the system degrade above requirement? | find saturation sequence |
| spike | Can it absorb and recover from a sudden burst? | campaigns, reconnect storms |
| soak/endurance | Does performance drift over time? | leaks, pool exhaustion, GC, cache behavior |
| breakpoint | Where is the controlled capacity boundary? | capacity planning, only in isolated env |

Never run stress, spike or breakpoint against production without explicit authorization, blast-radius controls and a stop plan.

For frontend, use browser tests primarily for user-experience signals and Core Web Vitals at controlled concurrency. Use protocol-level traffic generation for large-scale backend capacity questions; hundreds of real browsers usually answer a different and much more expensive question.
