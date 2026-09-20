import type {
  RuntimeDamageRollOptions,
  RuntimeDamageRollWorkerRequest,
  RuntimeDamageRollWorkerResponse,
} from './RuntimeDamageRollProtocol'

/** Options accepted by the caller-facing runtime damage-roll client. */
export interface RuntimeDamageRollCalculateOptions {
  readonly fftLength?: number
  readonly distributionLength?: number
  readonly rawSupportMax?: number
  readonly signal?: AbortSignal
  readonly requestId?: string | number
  readonly requestMetadata?: Readonly<Record<string, unknown>>
}

/** Weight vectors accepted by the runtime validator. */
export type RuntimeDamageRollWeights = readonly number[] | Float64Array

export type RuntimeDamageRollWorkerEvent = Readonly<{
  readonly data?: RuntimeDamageRollWorkerResponse
  readonly message?: string
}>

export type RuntimeDamageRollWorkerEventType =
  | 'message'
  | 'error'
  | 'messageerror'

/** Minimal worker surface required by the production client and test doubles. */
export interface RuntimeDamageRollWorkerLike {
  postMessage(
    message: RuntimeDamageRollWorkerRequest,
    transfer?: Transferable[],
  ): void
  terminate(): void
  addEventListener(
    type: RuntimeDamageRollWorkerEventType,
    listener: (event: RuntimeDamageRollWorkerEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void
}

export interface RuntimeDamageRollClientOptions {
  readonly workerFactory?: () => RuntimeDamageRollWorkerLike
  readonly cacheSize?: number
}

export interface RuntimeDamageRollClient {
  calculate(
    weights: RuntimeDamageRollWeights,
    kazanari: number,
    options?: RuntimeDamageRollCalculateOptions,
  ): Promise<Float64Array>
  clearCache(): void
  dispose(): void
}

/** Normalized request options sent across the worker boundary. */
export type RuntimeDamageRollWorkerOptions = RuntimeDamageRollOptions
