import {
  createCalculationClient,
  createCalculationDependencies,
} from '../../src/runtime/CalculationClient.js'
import { createRuntimeDamageRollClient } from '../../src/runtime/RuntimeDamageRollClient.js'

/**
 * Creates an experiment-local hybrid client with an independently owned
 * RuntimeDamageRollClient. The production singleton is deliberately avoided
 * so benchmark code can control cache state and lifecycle.
 */
export function createHybridBenchmarkClient({
  createDamageRollClient = createRuntimeDamageRollClient,
  damageRollClientOptions = {},
} = {}) {
  const damageRollClient = createDamageRollClient(damageRollClientOptions)
  let damageRollStarted = false
  let resolveDamageRollStart
  const damageRollStart = new Promise((resolve) => {
    resolveDamageRollStart = resolve
  })
  let damageRollSettledAt = null
  let resolveDamageRollSettled
  const damageRollSettled = new Promise((resolve) => {
    resolveDamageRollSettled = resolve
  })
  const getDamageRollDistribution = (...args) => {
    const [weights, kazanari, options] = args
    const originalUnderlyingSettled = options?.onUnderlyingSettled
    const wrappedOptions = typeof originalUnderlyingSettled === 'function'
      ? {
          ...options,
          onUnderlyingSettled: (promise) => {
            if (!damageRollStarted) {
              damageRollStarted = true
              resolveDamageRollStart()
              Promise.resolve(promise).then(
                () => {
                  damageRollSettledAt = performance.now()
                  resolveDamageRollSettled(damageRollSettledAt)
                },
                () => {
                  damageRollSettledAt = performance.now()
                  resolveDamageRollSettled(damageRollSettledAt)
                }
              )
            }
            originalUnderlyingSettled(promise)
          },
        }
      : options
    if (typeof originalUnderlyingSettled !== 'function' && !damageRollStarted) {
      // This branch is only a diagnostic fallback for an injected dependency
      // that does not expose the normal runtime settlement hook.
      damageRollStarted = true
      resolveDamageRollStart()
    }
    return damageRollClient.calculate(weights, kazanari, wrappedOptions)
  }
  const calculationClient = createCalculationClient(
    createCalculationDependencies({
      getDamageRollDistribution,
    })
  )

  return {
    ...calculationClient,
    clearDamageRollCache() {
      damageRollClient.clearCache()
    },
    waitUntilDamageRollStart() {
      return damageRollStart
    },
    waitUntilDamageRollSettled() {
      return damageRollSettled
    },
    get damageRollStarted() {
      return damageRollStarted
    },
    dispose() {
      damageRollClient.dispose()
    },
  }
}
