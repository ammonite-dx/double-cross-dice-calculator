import {
  generateMixedDamageDistribution,
} from '../calculation/RuntimeDamageRollCalculator'
import {
  normalizeRuntimeDamageRollWorkerRequest,
} from './RuntimeDamageRollProtocol'
import type {
  RuntimeDamageRollWorkerResponse,
} from './RuntimeDamageRollProtocol'

interface RuntimeDamageRollWorkerScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void
  postMessage(message: RuntimeDamageRollWorkerResponse, transfer?: Transferable[]): void
}

const workerScope = self as unknown as RuntimeDamageRollWorkerScope

function getCorrelatableRequestId(value: unknown): number | null {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null
  }

  const id = (value as Record<string, unknown>).id
  if (!Number.isSafeInteger(id) || typeof id !== 'number' || id < 0) {
    return null
  }
  return id
}

function getErrorResponse(error: unknown): { name: string; message: string } {
  const errorLike = error !== null
    && (typeof error === 'object' || typeof error === 'function')
    ? error as { readonly name?: unknown; readonly message?: unknown }
    : null

  const name = errorLike?.name
  const message = errorLike?.message
  return {
    name: typeof name === 'string' && name.length > 0 ? name : 'Error',
    message: typeof message === 'string' && message.length > 0
      ? message
      : String(error),
  }
}

workerScope.addEventListener('message', (event) => {
  let requestId = getCorrelatableRequestId(event?.data)
  try {
    const request = normalizeRuntimeDamageRollWorkerRequest(event?.data)
    requestId = request.id
    const distribution = generateMixedDamageDistribution(
      request.weights as ArrayLike<number>,
      request.kazanari as number,
      request.options as Parameters<typeof generateMixedDamageDistribution>[2],
    )

    workerScope.postMessage(
      { id: request.id, distribution },
      [distribution.buffer as ArrayBuffer],
    )
  } catch (error) {
    if (requestId === null) {
      throw error
    }
    workerScope.postMessage({
      id: requestId,
      error: getErrorResponse(error),
    })
  }
})
