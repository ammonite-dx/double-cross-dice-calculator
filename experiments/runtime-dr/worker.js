import { generateMixedDamageDistributionOptimized } from './optimized.js'

self.addEventListener('message', (event) => {
  const { id, weights, kazanari } = event.data
  try {
    const distribution = generateMixedDamageDistributionOptimized(
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
