import type {
  RuntimeDamageRollClient,
  RuntimeDamageRollWorkerLike,
} from '../../src/runtime/RuntimeDamageRollClientTypes'
import type {
  RuntimeDamageRollWorkerRequest,
  RuntimeDamageRollWorkerResponse,
} from '../../src/runtime/RuntimeDamageRollProtocol'
import type {
  CalculationFeedbackState,
  CalculationRequestCoordinator,
  LatestCalculationRunner,
} from '../../src/runtime/CalculationFeedbackTypes'
import { createLatestCalculationRunner } from '../../src/runtime/CalculationFeedback'
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
  estimates: { float64Bytes: 1024, operations: 4, timeMs: 1 },
})

const request: RuntimeDamageRollWorkerRequest = {
  id: 1,
  weights: new Float64Array([1]),
  kazanari: 0,
  options: { fftLength: 2, distributionLength: 2, rawSupportMax: 0 },
}
void request

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

const inferredRunner = createLatestCalculationRunner({
  feedback,
  snapshotRequest: (request: { value: number }) => request,
  calculate: async (request) => {
    request.value
    request.signal
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
