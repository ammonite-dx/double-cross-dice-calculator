# ADR 0003: Browser Worker Execution Boundary

- Status: Accepted
- Date: 2026-09-08
- Decision: Keep the current hybrid execution boundary

## Context

The application is a static SPA. Its current production execution topology keeps range planning, DX／Score, damage orchestration, total damage, and backtrack on the main thread, while a persistent module Worker executes the mixed damage-roll primitive. R19 was opened to decide whether the boundary should be extended to a partial or generalized calculation Worker.

The comparison must include not only arithmetic time but also Worker startup, structured-clone transport, main-thread responsiveness, Long Tasks, and rapid supersession. A caller Abort is not treated as underlying cancellation: the caller may settle immediately while the Worker request continues.

## Measured evidence

The experiment under `experiments/r19-worker-architecture/` compared the production hybrid with a generalized Worker prototype that reuses production calculation modules and calls `generateMixedDamageDistribution` directly inside the same Worker. Ten representative fixtures produced identical digests in both paths. Chromium desktop and Chromium CDP CPU 4x were measured with warmup 1 and three samples; Firefox and WebKit were unavailable in this environment because their Playwright processes failed with `spawn EPERM`.

The hybrid path produced no repeatable Long Task at or above the 50ms blocking threshold. Under CPU 4x its largest observed heartbeat delay was 17.1ms. The generalized Worker reduced main-thread work, but its `kazanari>0` warm median was 14.3〜14.4ms versus 0.8〜4.5ms for the hybrid fixture, and a rapid supersession left the latest request waiting about 14ms behind stale work. Structured-clone and message overhead was approximately 0.0〜0.3ms median for the measured payloads. Cold generalized-Worker ready time varied between 26.4ms and 387.8ms in the two runs.

Detailed measurements and limitations are recorded in [R19 Worker Architecture Decision](../r19-worker-architecture-decision.md).

## Decision

Keep the current hybrid boundary. Do not migrate Check, Attack, Total Damage, or Backtrack to a generalized Worker in R19. Keep `RuntimeDamageRollWorker` as the production boundary for the mixed damage-roll primitive, and keep `ResourceGuard` ownership on the main thread.

## Consequences

- The production source and public CalculationClient contract remain unchanged.
- Existing mixed damage-roll Worker caching and its caller-versus-underlying settlement semantics remain intact.
- The application avoids a generalized Worker queue that can delay the newest request after a caller Abort.
- A future Worker migration will need an explicit ResourceGuard lease protocol, failure serialization, latest-wins policy, and a response to stale synchronous work before production adoption.
- The R19 experiment and protocol tests remain as a repeatable decision baseline, not as a runtime dependency.

## Rejected alternatives

Generalized Worker execution was rejected because the measured improvement in main-thread responsiveness did not correspond to a repeatable blocking problem, while warm damage-roll latency and supersession queue delay increased. A partial Worker was not implemented because no operation met the adoption threshold. Worker pools, terminate/recreate on supersession, cooperative cancellation, SharedArrayBuffer, and transfer optimization are deferred until a future measurement justifies their complexity.

## Revisit conditions

Reopen this ADR when an accepted production case repeatedly creates a 50ms-or-longer Long Task, when real-device or CPU-throttled measurements show persistent frame-budget violations, or when a new operation exceeds the current hybrid boundary. Any reopening should repeat the R19 parity and supersession measurements before changing production ownership.
