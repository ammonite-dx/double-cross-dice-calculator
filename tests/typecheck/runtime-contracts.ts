import type {
  RuntimeDamageRollClient,
  RuntimeDamageRollWorkerLike,
  RuntimeDamageRollWeights,
} from '../../src/runtime/RuntimeDamageRollClientTypes'
import type {
  RuntimeDamageRollWorkerEnvelope,
  RuntimeDamageRollWorkerRequest,
  RuntimeDamageRollWorkerResponse,
} from '../../src/runtime/RuntimeDamageRollProtocol'
import type {
  CalculationRuntimeOptions,
  RuntimeDamageRollCalculateOptions,
} from '../../src/calculation/CalculationRuntimeTypes'
import type {
  CalculationCancellationContext,
  CalculationFeedbackState,
  CalculationRequestCoordinator,
  CalculationRequestStatus,
  CalculationRunnerContext,
} from '../../src/runtime/CalculationFeedbackTypes'
import {
  createCalculationRequestCoordinator,
} from '../../src/runtime/CalculationFeedback'
import { CALCULATION_REQUEST_STATUS } from '../../src/runtime/CalculationRequestStatus'
import type {
  ResourceGuardAbortSignal,
  ResourceGuardPolicyInput,
  ResourceGuard,
  ResourceLease,
  ResourceLeaseResult,
  ResourceReservationPlan,
} from '../../src/runtime/ResourceGuardTypes'
import {
  createResourceGuard,
  isResourceGuardError,
} from '../../src/runtime/ResourceGuard'
import { createCheckRangePolicy } from '../../src/runtime/CheckRangePolicy'
import type { DisplayRequestSnapshot } from '../../src/domain/CalculationInputs'
import type { RangePolicyInput } from '../../src/calculation/planning/RangePlannerTypes'

declare const damageClient: RuntimeDamageRollClient
declare const worker: RuntimeDamageRollWorkerLike
declare const guard: ResourceGuard
declare const browserWorker: Worker

const browserWorkerLike: RuntimeDamageRollWorkerLike = browserWorker
const readonlyWeights: RuntimeDamageRollWeights = [1, 0]
void browserWorkerLike
void readonlyWeights

const typedGuard: ResourceGuard = createResourceGuard({
  capacityBytes: 1024,
  maxActive: 1,
})
const partialPolicy: ResourceGuardPolicyInput = {
  capacityBytes: 1024,
  maxQueued: 1,
}
// @ts-expect-error: unknown policy keys are not part of the public contract.
const invalidPolicy: ResourceGuardPolicyInput = { unknown: 1 }
void typedGuard
void partialPolicy
void invalidPolicy

const typedCheckDisplay: DisplayRequestSnapshot = {
  min: 0,
  max: 30,
  mode: 'pmf',
}
const typedCheckPolicy: RangePolicyInput = createCheckRangePolicy(
  typedCheckDisplay,
  {
    display: { maxPoints: 100 },
    limits: { workingLength: 4096 },
  },
)
void typedCheckPolicy

const invalidCheckRangePolicy: RangePolicyInput = {
  // @ts-expect-error: retired calculationMax is not part of the public contract.
  calculationMax: 1022,
}
void invalidCheckRangePolicy

const fakeSignal: ResourceGuardAbortSignal = {
  aborted: false,
  addEventListener: (_type, _listener, _options) => {},
  removeEventListener: (_type, _listener, _options) => {},
}
const immediateLease: Promise<ResourceLease> = guard.acquire({
  signal: fakeSignal,
  requestId: null,
})
const flexibleLease: ResourceLeaseResult = guard.acquireLease()
const planLease: ResourceLeaseResult = guard.acquireForPlan({
  operation: 'check',
})
void immediateLease
void flexibleLease
void planLease

const unknownError: unknown = {}
if (isResourceGuardError(unknownError)) {
  unknownError.code
}

void damageClient.calculate([1], 0, { signal: new AbortController().signal })
void damageClient.calculate(readonlyWeights, 0, {
  requestId: 'request-id',
  requestMetadata: { source: 'typecheck' },
})
// @ts-expect-error: typed-array weight vectors other than Float64Array are rejected at runtime.
void damageClient.calculate(new Uint8Array([1]), 0)
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

const runtimeOptions: CalculationRuntimeOptions = {
  signal: new AbortController().signal,
  requestId: 'runtime-request',
  requestMetadata: { source: 'typecheck' },
}
const damageRollOptions: RuntimeDamageRollCalculateOptions = {
  ...runtimeOptions,
  fftLength: 16,
  distributionLength: 9,
  rawSupportMax: 8,
}
// @ts-expect-error: caller-side planning options are not runtime options.
const invalidRuntimeOptions: CalculationRuntimeOptions = { rangePolicy: {} }
// @ts-expect-error: unknown keys are not forwarded across the runtime boundary.
const invalidRuntimeOptionKey: CalculationRuntimeOptions = { scoreDisplayRequest: {} }
void damageRollOptions
void invalidRuntimeOptions
void invalidRuntimeOptionKey

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
declare const reservationPlan: ResourceReservationPlan

void feedback
void coordinator.run({ value: 1 })
void reservationPlan

const requestStatus: CalculationRequestStatus = coordinator.snapshot().status
void requestStatus
const statusValues: readonly CalculationRequestStatus[] = Object.values(
  CALCULATION_REQUEST_STATUS,
)
void statusValues
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

readResponse({
  id: 1,
  distribution: new Float64Array([1]),
})
