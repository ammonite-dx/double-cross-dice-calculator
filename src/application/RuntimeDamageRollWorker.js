import {
  generateMixedDamageDistribution,
} from '../calculation/RuntimeDamageRollCalculator'

self.addEventListener('message', (event) => {
  const { id, weights, kazanari } = event.data
  try {
    const distribution = generateMixedDamageDistribution(
      weights,
      kazanari
    )

    self.postMessage(
      { id, distribution },
      [distribution.buffer]
    )
  } catch (error) {
    self.postMessage({
      id,
      error: {
        name: error?.name || 'Error',
        message: error?.message || String(error),
      },
    })
  }
})
