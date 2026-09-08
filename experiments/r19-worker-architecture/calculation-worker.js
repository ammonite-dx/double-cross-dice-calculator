import {
  createCalculationClient,
  createCalculationDependencies,
} from '../../src/runtime/CalculationClient.js'
import {
  generateMixedDamageDistribution,
} from '../../src/calculation/RuntimeDamageRollCalculator.js'

const workerStartedAt = performance.now()

// Candidate B deliberately runs the mixed-damage primitive in this same
// Worker. It does not create the production RuntimeDamageRollWorker, so the
// experiment compares one generalized Worker with the current hybrid path.
const calculationClient = createCalculationClient(
  createCalculationDependencies({
    getDamageRollDistribution: generateMixedDamageDistribution,
  })
)

function serializeError(error) {
  const serialized = {
    name: error?.name || 'Error',
    message: error?.message || String(error),
  }
  if (typeof error?.code === 'string') {
    serialized.code = error.code
  }
  if (Array.isArray(error?.rejectionReasons)) {
    serialized.rejectionReasons = [...error.rejectionReasons]
  }
  if (error?.plan && typeof error.plan === 'object') {
    serialized.plan = error.plan
  }
  return serialized
}

function postFailure(id, error) {
  self.postMessage({
    id,
    type: 'failure',
    error: serializeError(error),
  })
}

function assertRequest(message) {
  if (message === null || typeof message !== 'object') {
    throw new TypeError('Worker request must be an object')
  }
  if (!Number.isSafeInteger(message.id) || message.id <= 0) {
    throw new TypeError('Worker request id must be a positive safe integer')
  }
  if (typeof message.operation !== 'string') {
    throw new TypeError('Worker request operation must be a string')
  }
  if (message.args === null || typeof message.args !== 'object') {
    throw new TypeError('Worker request args must be an object')
  }
}

async function execute(message) {
  const startedAt = performance.now()
  const options = {
    ...(message.options ?? {}),
    onRangePlan: (plan) => {
      self.postMessage({
        id: message.id,
        type: 'plan',
        plan,
      })
    },
  }

  let result
  switch (message.operation) {
    case 'check':
      result = await calculationClient.calculateCheck(
        message.args.params,
        message.args.difficulty,
        options
      )
      break
    case 'attack':
      result = await calculationClient.calculateAttack(
        message.args.params,
        options
      )
      break
    case 'totalDamage':
      result = await calculationClient.calculateTotalDamage(
        message.args.damages,
        options
      )
      break
    case 'backtrack':
      result = await calculationClient.calculateBacktrack(
        message.args.params,
        options
      )
      break
    default:
      throw new TypeError(`Unknown Worker operation: ${message.operation}`)
  }

  self.postMessage({
    id: message.id,
    type: 'success',
    result,
    workerTiming: {
      computeMs: performance.now() - startedAt,
    },
  })
}

self.addEventListener('message', (event) => {
  const message = event.data
  let id = null
  try {
    id = message?.id ?? null
    assertRequest(message)
    id = message.id
    void execute(message).catch((error) => postFailure(id, error))
  } catch (error) {
    if (id !== null) {
      postFailure(id, error)
    }
  }
})

self.postMessage({
  type: 'ready',
  workerTiming: {
    startupMs: performance.now() - workerStartedAt,
  },
})
