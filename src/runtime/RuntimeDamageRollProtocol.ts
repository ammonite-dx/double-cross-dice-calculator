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

/**
 * Validate the small amount of structure that belongs to the Worker wire
 * boundary. The numerical payload is intentionally left to the calculator's
 * own validation so that this boundary does not duplicate kernel rules.
 */
export function normalizeRuntimeDamageRollWorkerRequest(
  value: unknown,
): RuntimeDamageRollWorkerRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(
      'runtime damage roll worker message must be an object',
    )
  }

  const message = value as Record<string, unknown>
  if (!Number.isSafeInteger(message.id) || (message.id as number) < 0) {
    throw new TypeError(
      'runtime damage roll worker message id must be a non-negative safe integer',
    )
  }

  return {
    id: message.id as number,
    weights: message.weights as Float64Array,
    kazanari: message.kazanari as number,
    options: message.options as RuntimeDamageRollOptions,
  }
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
