/**
 * Typed protocol for the browser runtime damage-roll Worker. The protocol
 * records the client/Worker message boundary without duplicating numerical
 * validation or changing transfer behavior.
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
 * Runtime shape after wire-level validation. The payload is intentionally
 * unknown until the numerical kernel validates it.
 */
export interface RuntimeDamageRollWorkerEnvelope {
  readonly id: number
  readonly weights: unknown
  readonly kazanari: unknown
  readonly options: unknown
}

/**
 * Validate the small amount of structure that belongs to the Worker wire
 * boundary. The numerical payload is intentionally left to the calculator's
 * own validation so that this boundary does not duplicate kernel rules.
 */
export function normalizeRuntimeDamageRollWorkerRequest(
  value: unknown,
): RuntimeDamageRollWorkerEnvelope {
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
    weights: message.weights,
    kazanari: message.kazanari,
    options: message.options,
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
