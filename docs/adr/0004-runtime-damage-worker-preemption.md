# ADR 0004: Runtime Damage Worker Preemption

- Status: Accepted
- Date: 2026-09-15
- Decision: Preempt abandoned Runtime Damage jobs at the Worker lifecycle boundary

## Context

The application keeps the mixed damage-roll FFT primitive in a browser module Worker while score calculation, damage orchestration, range planning, and resource admission remain on the main thread. The former client exposed an `onUnderlyingSettled` hook because caller Abort rejected only the caller promise while the Worker request continued. CalculationClient therefore tracked the underlying promise and held its ResourceGuard lease until the Worker finished.

That design preserved shared work, but it made the public runtime lifecycle harder to understand and allowed stale CPU work to continue after a latest-wins request had replaced it. It also separated the lifetime of a caller's resource reservation from the lifetime of the request that caller no longer needed.

## Technical constraint

`RuntimeDamageRollWorker` executes the damage-roll kernel synchronously. While a job is running, the Worker event loop cannot process a cooperative cancel message. Cancellation is therefore a Worker lifecycle operation, not a new message-protocol operation.

## Decision

`RuntimeDamageRollClient` owns an explicit main-thread queue and subscriber state.

- At most one job is posted to a Worker at a time; later jobs remain in the client queue.
- Identical requests share one job and have independent caller subscribers.
- Aborting one subscriber rejects only that caller. The shared job continues while another subscriber remains.
- If the last subscriber leaves a queued job, the job is removed without creating or terminating a Worker.
- If the last subscriber leaves an active job, the current Worker is terminated, the job is settled with `AbortError`, and a fresh Worker may start the next queued job.
- Worker listeners carry an identity token, so late events from a terminated Worker cannot affect a replacement Worker.
- Unexpected Worker `error` and `messageerror` events remain fatal for the active and queued jobs. A calculation error returned by the Worker remains local to its job and does not poison the resident Worker.
- `CalculationRequestCoordinator` aborts the active request when a newer request supersedes it. Snapshot failure also aborts the stale active request and discards an older queued request.
- Each CalculationClient request owns its own ResourceGuard lease and releases it from the request's `finally` path. A shared Worker job does not own or extend another request's lease.

The Worker request/response protocol is unchanged. No cancel message, Worker pool, or generalized calculation Worker is introduced.

## Preserved architecture

- Only the Runtime Damage Roll FFT primitive uses a Worker.
- DX, score, D10, damage orchestration, backtrack, range planning, and total aggregation remain on the main thread.
- LRU caching, identical-request deduplication, defensive copies, and disposal semantics remain unchanged.
- The existing Worker protocol, numerical kernel, ResourceGuard policy, full-tail semantics, and published-bucket compatibility boundary remain unchanged.

## Consequences

The application now stops stale Runtime Damage CPU work when no caller needs it, lets the latest request begin after the aborted request unwinds, and makes ResourceGuard ownership match the CalculationClient request lifetime. The `onUnderlyingSettled` hook, lifecycle promise, and delayed lease-release path are removed.

The cost is Worker termination and recreation when an active job is abandoned, plus explicit queue and subscriber state in RuntimeDamageRollClient. Shared callers still avoid duplicate computation when at least one subscriber remains.

## Rejected alternatives

- A Worker cancel message was rejected because the synchronous kernel cannot process it until the current calculation has already finished.
- Chunking or making the FFT cooperative was rejected because it would change the numerical kernel and its performance characteristics.
- SharedArrayBuffer/Atomics and a Worker pool were rejected as unnecessary complexity for the current single-primitive boundary.
- Moving score, damage orchestration, or all calculations into a generalized Worker remains outside the current scope.

## Validation

The implementation is covered by Runtime Damage Worker tests for sole-caller preemption, shared subscribers, queued cancellation, fresh Worker restart, late-event isolation, fatal and job-level errors, cache behavior, and disposal. CalculationClient integration tests verify immediate lease release after preemption and independent leases for two callers sharing one Worker job. Latest-wins coordinator tests verify active abort, queued disposal, snapshot-failure cleanup, and stale-result suppression.
