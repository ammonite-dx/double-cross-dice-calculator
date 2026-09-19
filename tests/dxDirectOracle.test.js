import { describe, expect, it } from 'vitest'

import {
  calculateDxDistribution,
  DX_CRITICAL_MAX,
  DX_CRITICAL_MIN,
} from '../src/calculation/DxCalculator'

// Keep the oracle deliberately small and independent from the production
// recurrence.  The final slot is the overflow bucket, so every continuation
// that would add another ten-point block can be absorbed there.
const WORKING_LENGTH = 64
const OVERFLOW_INDEX = WORKING_LENGTH - 1

function enumerateFaces(dice, visit) {
  const faces = new Array(dice).fill(1)

  function walk(index) {
    if (index === dice) {
      visit(faces)
      return
    }
    for (let face = 1; face <= 10; face += 1) {
      faces[index] = face
      walk(index + 1)
    }
  }

  walk(0)
}

/**
 * Enumerate one roll for each reachable (score block, remaining dice) state.
 * No production tail, FFT, generator, or historical asset is used here.
 */
function directDxOracle({ dice, critical, shihai }) {
  const result = new Float64Array(WORKING_LENGTH)
  if (dice === 0) {
    result[0] = 1
    return result
  }
  if (dice <= shihai) {
    result[1] = 1
    return result
  }

  const maximumBlock = Math.ceil(OVERFLOW_INDEX / 10)
  const states = Array.from(
    { length: maximumBlock + 1 },
    () => new Map()
  )
  states[0].set(dice, 1)

  for (let block = 0; block < maximumBlock; block += 1) {
    for (const [remainingDice, stateMass] of states[block]) {
      if (stateMass === 0) {
        continue
      }
      const outcomeProbability = stateMass / 10 ** remainingDice

      enumerateFaces(remainingDice, (faces) => {
        let criticalCount = 0
        for (const face of faces) {
          if (face >= critical) {
            criticalCount += 1
          }
        }

        if (criticalCount <= shihai) {
          const descending = [...faces].sort((left, right) => right - left)
          const score = block * 10 + descending[shihai]
          const bucket = score >= OVERFLOW_INDEX ? OVERFLOW_INDEX : score
          result[bucket] += outcomeProbability
          return
        }

        const nextBlock = block + 1
        if (nextBlock * 10 >= OVERFLOW_INDEX) {
          result[OVERFLOW_INDEX] += outcomeProbability
          return
        }
        states[nextBlock].set(
          criticalCount,
          (states[nextBlock].get(criticalCount) ?? 0) + outcomeProbability
        )
      })
    }
  }

  return result
}

function assertProbabilityDistribution(distribution) {
  expect(distribution).toHaveLength(WORKING_LENGTH)
  let total = 0
  for (const probability of distribution) {
    expect(Number.isFinite(probability)).toBe(true)
    expect(probability).toBeGreaterThanOrEqual(0)
    total += probability
  }
  expect(total).toBeCloseTo(1, 12)
}

describe('DX distribution independent direct oracle', () => {
  it('matches every small supported combination', () => {
    for (let dice = 0; dice <= 4; dice += 1) {
      for (
        let critical = DX_CRITICAL_MIN;
        critical <= DX_CRITICAL_MAX;
        critical += 1
      ) {
        for (let shihai = 0; shihai <= 3; shihai += 1) {
          const params = { dice, critical, shihai, yousei: 0 }
          const actual = calculateDxDistribution(params, {
            workingLength: WORKING_LENGTH,
          })
          const expected = directDxOracle(params)

          assertProbabilityDistribution(actual)
          assertProbabilityDistribution(expected)

          let maximumAbsoluteError = 0
          for (let value = 0; value < WORKING_LENGTH; value += 1) {
            maximumAbsoluteError = Math.max(
              maximumAbsoluteError,
              Math.abs(actual[value] - expected[value])
            )
          }
          expect(maximumAbsoluteError, JSON.stringify(params))
            .toBeLessThanOrEqual(1e-10)
          expect(actual[OVERFLOW_INDEX]).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })
})
