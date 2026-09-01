import { describe, expect, it, vi } from 'vitest'

import { createCalculationClient } from '../src/application/CalculationClient'
import {
  calculateDxDistribution,
} from '../src/calculation/DxCalculator'
import {
  calculateScoreCanonical,
  getCanonicalScoreSummary,
} from '../src/calculation/ScoreCalculator'

function calculateCanonicalScore(
  params,
  getDistribution,
  scoreRangePlan,
  fix = false
) {
  return calculateScoreCanonical(
    params,
    { getDxDistribution: getDistribution },
    scoreRangePlan,
    fix
  )
}

const score = {
  dice: 1,
  critical: 10,
  skill: 0,
  yousei: 0,
  shihai: 0,
}

function checkParams(yousei) {
  return {
    action: { ...score, yousei },
    reaction: { ...score, yousei },
  }
}

describe('CalculationClient runtime DX cache identity', () => {
  it('separates Yousei counts and reuses identical requests', async () => {
    const calculateDx = vi.fn(calculateDxDistribution)
    const client = createCalculationClient({
      calculateDxDistribution: calculateDx,
      calculateScoreCanonical: calculateCanonicalScore,
      getCanonicalScoreSummary,
    })

    await client.calculateCheckCanonical(checkParams(0), {
      opposed: true,
    })
    expect(calculateDx).toHaveBeenCalledTimes(1)

    await client.calculateCheckCanonical(checkParams(1), {
      opposed: true,
    })
    expect(calculateDx).toHaveBeenCalledTimes(2)
    expect(calculateDx.mock.calls.map(([params]) => params.yousei))
      .toEqual([0, 1])

    await client.calculateCheckCanonical(checkParams(1), {
      opposed: true,
    })
    expect(calculateDx).toHaveBeenCalledTimes(2)
  })
})
