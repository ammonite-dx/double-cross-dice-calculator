import { performance } from 'node:perf_hooks'

import { generateMixedDamageDistributionReference } from '../experiments/runtime-dr/reference.js'
import { generateMixedDamageDistributionOptimized } from '../experiments/runtime-dr/optimized.js'

function benchmark(name, iterations, operation) {
  for (let iteration = 0; iteration < 3; iteration += 1) {
    operation()
  }

  const started = performance.now()
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    operation()
  }
  const elapsed = performance.now() - started

  return {
    name,
    iterations,
    millisecondsPerOperation: elapsed / iterations,
  }
}

function mixedWeights() {
  const weights = new Float64Array(203)

  for (let dice = 0; dice < weights.length; dice += 1) {
    const distance = dice - 24
    weights[dice] = Math.exp(-(distance * distance) / 72)
  }

  const total = weights.reduce((sum, weight) => sum + weight, 0)
  for (let dice = 0; dice < weights.length; dice += 1) {
    weights[dice] /= total
  }
  return weights
}

const weights = mixedWeights()
console.log(`Node ${process.version} on ${process.platform}/${process.arch}`)
const results = [
  ...[0, 3, 9].map((kazanari) =>
    benchmark(
      `runtime dr reference kazanari=${kazanari}`,
      kazanari === 0 ? 100 : 20,
      () => generateMixedDamageDistributionReference(weights, kazanari)
    )
  ),
  ...[0, 3, 9].map((kazanari) =>
    benchmark(
      `runtime dr optimized kazanari=${kazanari}`,
      kazanari === 0 ? 100 : 50,
      () => generateMixedDamageDistributionOptimized(weights, kazanari)
    )
  ),
]

for (const result of results) {
  console.log(
    `${result.name}: ${result.millisecondsPerOperation.toFixed(3)} ms/op ` +
    `(${result.iterations} iterations)`
  )
}
