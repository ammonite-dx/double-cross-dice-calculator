import { calculateDxDistribution } from '../../src/calculation/DxCalculator.js'

self.postMessage({ type: 'ready' })

self.addEventListener('message', (event) => {
  const { id, params } = event.data ?? {}

  try {
    const distribution = calculateDxDistribution(params)
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
