/**
 * Typed protocol for the browser runtime damage-roll Worker. The JavaScript
 * client and Worker remain the runtime implementation; this module records
 * the message boundary for future migration without changing transfer or
 * validation behavior.
 */

export interface RuntimeDamageRollOptions {
  readonly fftLength: number
  readonly distributionLength: number
  readonly rawSupportMax: number
}

export interface RuntimeDamageRollWorkerRequest {
  readonly id: number
  readonly weights: Float64Array
  readonly kazanari: number
  readonly options: RuntimeDamageRollOptions
}

export interface RuntimeDamageRollWorkerSuccess {
  readonly id: number
  readonly distribution: Float64Array
}

export interface RuntimeDamageRollWorkerError {
  readonly name: string
  readonly message: string
}

export interface RuntimeDamageRollWorkerFailure {
  readonly id: number
  readonly error: RuntimeDamageRollWorkerError
}

export type RuntimeDamageRollWorkerResponse =
  | RuntimeDamageRollWorkerSuccess
  | RuntimeDamageRollWorkerFailure
