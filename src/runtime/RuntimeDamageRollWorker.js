import {
  generateMixedDamageDistribution,
} from '../calculation/RuntimeDamageRollCalculator'
import {
  normalizeRuntimeDamageRollWorkerRequest,
} from './RuntimeDamageRollProtocol'

function getCorrelatableRequestId(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Number.isSafeInteger(value.id) ||
    value.id < 0
  ) {
    return null
  }
  return value.id
}

self.addEventListener('message', (event) => {
  let requestId = getCorrelatableRequestId(event?.data)
  try {
    const request = normalizeRuntimeDamageRollWorkerRequest(event?.data)
    requestId = request.id
    const distribution = generateMixedDamageDistribution(
      request.weights,
      request.kazanari,
      request.options
    )

    self.postMessage(
      { id: request.id, distribution },
      [distribution.buffer]
    )
  } catch (error) {
    if (requestId === null) {
      throw error
    }
    self.postMessage({
      id: requestId,
      error: {
        name: error?.name || 'Error',
        message: error?.message || String(error),
      },
    })
  }
})
