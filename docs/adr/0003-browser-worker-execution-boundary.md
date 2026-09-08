# ADR 0003: Browser Worker Execution Boundary

- Status: Accepted
- Date: 2026-09-08
- Decision: Keep the current hybrid execution boundary

## Context

The application is a static SPA. Its current production execution topology keeps range planning, DX／Score, damage orchestration, total damage, and backtrack on the main thread, while a persistent module Worker executes the mixed damage-roll primitive. R19 was opened to decide whether the boundary should be extended to a partial or generalized calculation Worker.

The comparison must include not only arithmetic time but also Worker startup, structured-clone transport, main-thread responsiveness, Long Tasks, and rapid supersession. A caller Abort is not treated as underlying cancellation: the caller may settle immediately while the Worker request continues. The initial R19 run compared a cache-enabled production hybrid with an uncached generalized prototype, so its repeated Attack latency difference was not sufficient evidence about the Worker boundary.

## Measured evidence

The experiment under `experiments/r19-worker-architecture/` compared the production hybrid with a generalized Worker prototype that reuses production calculation modules and calls `generateMixedDamageDistribution` directly inside the same Worker. Ten representative fixtures produced identical digests in both paths. Chromium desktop and Chromium CDP CPU 4x were measured with warmup 1 and three samples; Firefox and WebKit were unavailable in this environment because their Playwright processes failed with `spawn EPERM`.

The initial run remains valid for result parity and Long Task observation, but its repeated Attack latency attribution was confounded by the cache asymmetry. The corrected follow-up created a fresh hybrid client, cleared its Damage Roll cache before every timed sample, and used distinct cache-miss requests for supersession. Chrome and Chromium CDP CPU 4x both produced 10/10 parity in both steady-state and cache-miss modes. For the three primary cache-miss Attack fixtures, warm p50/p95/max were 1.2/1.3/1.3ms, 13.8/13.9/13.9ms, and 9.7/9.8/9.8ms for the hybrid, versus 1.4/1.6/1.6ms, 14.0/14.1/14.1ms, and 9.8/9.8/9.8ms for the generalized Worker on Chrome. Under CPU 4x they were 3.6/4.2/4.2ms, 16.5/16.8/16.8ms, and 12.0/12.0/12.0ms for the hybrid, versus 1.4/1.9/1.9ms, 14.5/14.8/14.8ms, and 10.0/10.2/10.2ms for the generalized Worker. No measured fixture produced a Long Task; the largest reported heartbeat delay in the corrected Attack measurements was 4.1ms for the hybrid and 4.3ms for the generalized Worker under CPU 4x. Structured-clone/message overhead remained approximately 0.0〜0.5ms median/p95 in the corrected samples. Generalized Worker ready time was measured separately from `firstMeasured` and varied between 20.7ms and 356.9ms across corrected runs.

Corrected supersession measurements used fresh clients, controlled cache state, and distinct inputs. In the `Attack A → Attack B` scenario, Chrome latest total latency was 35.9ms for the hybrid and 37.7ms for the generalized Worker, with a 22.7ms generalized queue delay. Under CPU 4x the corresponding values were 46.5ms and 40.0ms, with a 24.0ms generalized queue delay. In the `Attack A → Check B` scenario, Chrome latest total latency was 0.8ms for the hybrid and 24.6ms for the generalized Worker, with a 23.3ms generalized queue delay; under CPU 4x it was 4.1ms and 24.3ms, with a 23.0ms generalized queue delay. The stale underlying work settled separately in every scenario, and caller Abort remained prompt.

Detailed measurements and limitations are recorded in [R19 Worker Architecture Decision](../r19-worker-architecture-decision.md).

## Decision

Keep the current hybrid boundary. Do not migrate Check, Attack, Total Damage, or Backtrack to a generalized Worker in R19. Keep `RuntimeDamageRollWorker` as the production boundary for the mixed damage-roll primitive, and keep `ResourceGuard` ownership on the main thread. The corrected measurements did not show a repeatable 50ms-or-longer Long Task or a persistent frame-budget violation in the accepted cases, and the generalized Worker did not provide a clear UX improvement after cache effects were isolated.

## Consequences

- The production source and public CalculationClient contract remain unchanged.
- Existing mixed damage-roll Worker caching and its caller-versus-underlying settlement semantics remain intact.
- The application avoids a generalized Worker queue that can delay the newest request after a caller Abort.
- A future Worker migration will need an explicit ResourceGuard lease protocol, failure serialization, latest-wins policy, and a response to stale synchronous work before production adoption.
- The R19 experiment and protocol tests remain as a repeatable decision baseline, not as a runtime dependency.

## Rejected alternatives

Generalized Worker execution was rejected because the corrected cache-miss comparison did not establish a blocking problem that required a broader boundary, while a single Worker introduced queue delay for an unrelated latest Check after stale Attack work. The initial cache-enabled-versus-uncached latency difference is retained only as a historical steady-state observation, not as an architectural attribution. A partial Worker was not implemented because no operation met the adoption threshold. Worker pools, terminate/recreate on supersession, cooperative cancellation, SharedArrayBuffer, and transfer optimization are deferred until a future measurement justifies their complexity.

## Revisit conditions

Reopen this ADR when an accepted production case repeatedly creates a 50ms-or-longer Long Task, when real-device or CPU-throttled measurements show persistent frame-budget violations, or when a new operation exceeds the current hybrid boundary. Any reopening should repeat the R19 parity and supersession measurements before changing production ownership.
