import { describe, expect, it } from 'vitest'

import {
  createDamageRollRequest,
} from '../src/calculation/DamageCalculator'
import {
  createDistributionResult,
} from '../src/calculation/DistributionResult'
import {
  getScoreOutcomePartition,
  getScoreStatistics,
} from '../src/calculation/ScoreCalculator'

function scoreEnvelope(entries, forcedFailureProbability = 0) {
  const maxValue = Math.max(...entries.map(([value]) => value))
  const values = new Float64Array(maxValue + 1)
  for (const [value, probability] of entries) {
    values[value] = probability
  }
  return {
    result: createDistributionResult({
      values,
      offset: 0,
      support: { kind: 'finite', max: maxValue },
      overflow: null,
    }),
    metadata: {
      modeledDistribution: true,
      forcedFailureProbability,
    },
  }
}

function opposed(action, reaction) {
  return getScoreStatistics({ action, reaction }).action.successProbability
}

describe('score outcome semantics', () => {
  it.each([
    ['forced action loses to a regular reaction', [[[0, 1]], 1], [[[1, 1]], 0], 0],
    ['forced action loses to a forced reaction', [[[0, 1]], 1], [[[0, 1]], 1], 0],
    ['regular action beats a forced reaction', [[[0, 1]], 0], [[[0, 1]], 1], 1],
    ['regular ties go to the reaction', [[[3, 1]], 0], [[[3, 1]], 0], 0],
    ['a larger regular score wins', [[[4, 1]], 0], [[[3, 1]], 0], 1],
  ])('%s', (_label, actionSpec, reactionSpec, expected) => {
    const actual = opposed(
      scoreEnvelope(...actionSpec),
      scoreEnvelope(...reactionSpec)
    )
    expect(actual).toEqual({ kind: 'exact', value: expected })
  })

  it('separates forced failure from an ordinary displayed zero', () => {
    const envelope = scoreEnvelope([[0, 1]], 0.1)
    const partition = getScoreOutcomePartition(envelope)

    expect(envelope.result.values[0]).toBe(1)
    expect(partition.forcedFailureProbability).toBeCloseTo(0.1, 12)
    expect(partition.regularZeroProbability).toBeCloseTo(0.9, 12)
    expect(partition.regularBuckets).toEqual([
      { value: 0, probability: 0.9 },
    ])
  })

  it('treats a regular score zero as success at fixed difficulty zero', () => {
    const regularZero = scoreEnvelope([[0, 1]], 0)
    const forcedZero = scoreEnvelope([[0, 1]], 1)

    expect(getScoreStatistics(
      { action: regularZero, reaction: scoreEnvelope([[0, 1]]) },
      { opposed: false, target: 0 }
    ).action.successProbability).toEqual({ kind: 'exact', value: 1 })
    expect(getScoreStatistics(
      { action: forcedZero, reaction: scoreEnvelope([[0, 1]]) },
      { opposed: false, target: 0 }
    ).action.successProbability).toEqual({ kind: 'exact', value: 0 })
  })

  it('keeps Check and Attack hit semantics in parity', () => {
    const action = scoreEnvelope([[0, 1]], 0.1)
    const reaction = scoreEnvelope([[0, 1]], 1)
    const check = opposed(action, reaction)
    const attack = createDamageRollRequest(
      { action, reaction },
      { dice: 0, value: 0, kazanari: 0 },
      null
    )

    expect(check).toEqual({ kind: 'exact', value: 0.9 })
    expect(attack.hitProbability).toBeCloseTo(0.9, 12)
    expect(attack.failureProbability).toBeCloseTo(0.1, 12)
  })
})
