import { addSafe } from './planning/PlanningMath'

/**
 * Return the largest raw score that is known to be reachable without a
 * critical-chain tail. A null result means that the score has unbounded
 * support and therefore needs an explicit working cutoff plus overflow.
 *
 * The caller supplies normalized score parameters. Keeping this decision in
 * one pure helper makes the planner's memory estimate agree with the score
 * producer's actual representation.
 */
export function getFiniteRawSupportMax(params) {
  if (params.dice === 0) {
    return 0
  }
  if (params.dice <= (params.shihai ?? 0)) {
    // The raw DX result is a fumble (1). ScoreCalculator will move this
    // bucket to score 0 and record it as forced failure.
    return 1
  }
  if (params.critical === 11) {
    return 10
  }
  return null
}

export function getScoreSupport(params) {
  const finiteRawSupportMax = getFiniteRawSupportMax(params)
  if (finiteRawSupportMax === null) {
    return { kind: 'infinite' }
  }
  if (params.dice > 0 && params.dice <= (params.shihai ?? 0)) {
    return { kind: 'finite', max: 0 }
  }
  if (finiteRawSupportMax === 0) {
    return { kind: 'finite', max: 0 }
  }

  return {
    kind: 'finite',
    max: Math.max(
      0,
      addSafe(
        finiteRawSupportMax,
        params.skill,
        'score support range'
      )
    ),
  }
}

export function getScoreOutputMax(params, workingMax) {
  if (!Number.isSafeInteger(workingMax) || workingMax < 0) {
    throw new RangeError('workingMax must be a non-negative safe integer')
  }

  const support = getScoreSupport(params)
  if (support.kind === 'finite') {
    return support.max
  }
  return Math.max(
    0,
    addSafe(workingMax, params.skill, 'score output range')
  )
}

export function getScoreOutputBufferLength(params, workingMax) {
  return addSafe(
    getScoreOutputMax(params, workingMax),
    1,
    'score output array size'
  )
}
