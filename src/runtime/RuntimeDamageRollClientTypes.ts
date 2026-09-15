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
}

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
    transfer?: readonly Transferable[],
  ): void
  terminate(): void
  addEventListener(
    type: RuntimeDamageRollWorkerEventType,
    listener: (event: RuntimeDamageRollWorkerEvent) => void,
  ): void
}

export interface RuntimeDamageRollClientOptions {
  readonly workerFactory?: () => RuntimeDamageRollWorkerLike
  readonly cacheSize?: number
}

export interface RuntimeDamageRollClient {
  calculate(
    weights: ArrayLike<number>,
    kazanari: number,
    options?: RuntimeDamageRollCalculateOptions,
  ): Promise<Float64Array>
  clearCache(): void
  dispose(): void
}

/** Normalized request options sent across the worker boundary. */
export type RuntimeDamageRollWorkerOptions = RuntimeDamageRollOptions
