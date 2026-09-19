import type {
  RuntimeDamageRollClient,
  RuntimeDamageRollWorkerLike,
} from '../../src/runtime/RuntimeDamageRollClientTypes'
import type {
  RuntimeDamageRollWorkerEnvelope,
  RuntimeDamageRollWorkerRequest,
  RuntimeDamageRollWorkerResponse,
} from '../../src/runtime/RuntimeDamageRollProtocol'
import type {
  CalculationCancellationContext,
  CalculationFeedbackState,
  CalculationRequestCoordinator,
  CalculationRequestStatus,
  CalculationRunnerContext,
  LatestCalculationRunner,
} from '../../src/runtime/CalculationFeedbackTypes'
import {
  createCalculationRequestCoordinator,
  createLatestCalculationRunner,
} from '../../src/runtime/CalculationFeedback'
import type {
  ResourceGuard,
  ResourceReservationPlan,
} from '../../src/runtime/ResourceGuardTypes'

declare const damageClient: RuntimeDamageRollClient
declare const worker: RuntimeDamageRollWorkerLike
declare const guard: ResourceGuard

void damageClient.calculate([1], 0, { signal: new AbortController().signal })
void worker
void guard.acquireForPlan({
  operation: 'damage',
  estimates: { float64Bytes: 1024 },
})

const request: RuntimeDamageRollWorkerRequest = {
  id: 1,
  weights: new Float64Array([1]),
  kazanari: 0,
  options: { fftLength: 2, distributionLength: 2, rawSupportMax: 0 },
}
void request

const envelope: RuntimeDamageRollWorkerEnvelope = {
  id: 1,
  weights: undefined,
  kazanari: undefined,
  options: undefined,
}
void envelope
// @ts-expect-error: a wire envelope must not be treated as a validated request.
const requestFromEnvelope: RuntimeDamageRollWorkerRequest = envelope
void requestFromEnvelope

// AbortSignal belongs to the caller-side client options, not the worker wire protocol.
const requestWithSignal: RuntimeDamageRollWorkerRequest = {
  ...request,
  // @ts-expect-error: worker requests must not carry a signal.
  signal: new AbortController().signal,
}
void requestWithSignal

function readResponse(response: RuntimeDamageRollWorkerResponse) {
  if ('distribution' in response) {
    response.distribution.length
  } else {
    response.error.message
  }
}

declare const feedback: CalculationFeedbackState
declare const coordinator: CalculationRequestCoordinator<
  { value: number },
  { value: number }
>
declare const runner: LatestCalculationRunner<
  { value: number },
  { value: number }
>
declare const reservationPlan: ResourceReservationPlan

void feedback
void coordinator.run({ value: 1 })
void runner.run({ value: 1 })
void reservationPlan

const requestStatus: CalculationRequestStatus = coordinator.snapshot().status
void requestStatus
// @ts-expect-error: request status is a closed runtime union.
const invalidRequestStatus: CalculationRequestStatus = 'unknown'
void invalidRequestStatus

const typedCoordinator = createCalculationRequestCoordinator<
  { value: number },
  { result: number },
  { id: string },
  { tag: string }
>({
  execute: (request, context: CalculationRunnerContext<
    { value: number },
    { id: string },
    { tag: string }
  >) => {
    request.value
    context.revision
    context.options.tag
    context.options.signal
    context.onRangePlan({ id: 'plan' })
    return { result: request.value }
  },
  onStart: (_request, context) => {
    context.options.tag
    context.signal
    // @ts-expect-error: onStart has no range-plan callback of its own.
    context.onRangePlan
  },
  onCancelled: (context: CalculationCancellationContext<
    { value: number },
    { id: string },
    { tag: string }
  >) => {
    if (context.request === null) {
      context.signal
      context.options
    } else {
      context.request.value
      context.signal
      context.options.tag
    }
  },
  onError: (_error, context) => {
    if ('onRangePlan' in context) {
      context.onRangePlan({ id: 'plan' })
    } else {
      context.request.value
      // @ts-expect-error: a snapshot-error context has no runner signal.
      context.signal
    }
  },
})

void typedCoordinator.run({ value: 1 }, { tag: 'typed' })

const inferredRunner = createLatestCalculationRunner({
  feedback,
  snapshotRequest: (request: { value: number }) => request,
  calculate: async (request) => {
    request.value
    request.signal
    request.onRangePlan
    // @ts-expect-error: factory callback request must not be implicitly any.
    request.missing
    return { result: request.value }
  },
  commitResult: (result) => {
    result.result
  },
})

void inferredRunner.run({ value: 1 })
// @ts-expect-error: Latest runner exposes one request argument only.
void inferredRunner.run({ value: 1 }, {})

readResponse({
  id: 1,
  distribution: new Float64Array([1]),
})
