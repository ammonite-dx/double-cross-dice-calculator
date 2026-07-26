import {
  DISTRIBUTION_SIZE,
} from './Distribution'
import {
  getD10Distribution,
  getLivingdeadDistribution,
} from './PrecomputedDataRepository'

const DLOIS_RULES = {
  '戦闘用人格・生きる伝説': { diceModifier: -1 },
  生還者: { diceModifier: 3 },
  '不死者・悪夢': { nightmare: true },
  屍人: { livingdead: true },
  '戦友(通常)': { diceModifier: 2 },
  '戦友(強化)': { diceModifier: 4 },
}

function getBoundary(params, threshold) {
  return Math.max(0, params.encroachment - params.value - threshold)
}

function toPercentage(distribution, start, end) {
  const probability = distribution
    .slice(start, end)
    .reduce((sum, value) => sum + value, 0)

  return Math.round(probability * 1000) / 10
}

function getStandardSingleResult(distribution, params) {
  const boundaries = [99, 70, 50, 30]
    .map((threshold) => getBoundary(params, threshold))
  const ranges = [
    [0, boundaries[0]],
    [boundaries[0], boundaries[1]],
    [boundaries[1], boundaries[2]],
    [boundaries[2], boundaries[3]],
    [boundaries[3], DISTRIBUTION_SIZE],
  ]

  return ranges.map(([start, end]) =>
    toPercentage(distribution, start, end)
  )
}

function getNightmareSingleResult(distribution, params) {
  const boundaries = [119, 100, 99, 70, 50, 30]
    .map((threshold) => getBoundary(params, threshold))
  const ranges = [
    [0, boundaries[0]],
    [boundaries[0], boundaries[1]],
    [boundaries[2], boundaries[3]],
    [boundaries[3], boundaries[4]],
    [boundaries[4], boundaries[5]],
    [boundaries[5], DISTRIBUTION_SIZE],
  ]

  return ranges.map(([start, end]) =>
    toPercentage(distribution, start, end)
  )
}

function getBinaryResult(distribution, params, threshold) {
  const boundary = getBoundary(params, threshold)

  return [
    toPercentage(distribution, 0, boundary),
    toPercentage(distribution, boundary, DISTRIBUTION_SIZE),
  ]
}

export function getFinalEncroachment(params) {
  const rule = DLOIS_RULES[params.dlois] ?? {}
  const diceModifier = rule.diceModifier ?? 0
  const getDistribution = rule.livingdead
    ? getLivingdeadDistribution
    : getD10Distribution
  const threshold = rule.nightmare ? 119 : 99

  const singleDistribution = getDistribution(
    params.lois + params.elois + params.dice + diceModifier
  )
  const doubleDistribution = getDistribution(
    params.lois * 2 + params.elois + params.dice + diceModifier
  )
  const secondDistribution = getDistribution(
    params.lois * 3 + params.elois + params.dice + diceModifier
  )

  return {
    single: rule.nightmare
      ? getNightmareSingleResult(singleDistribution, params)
      : getStandardSingleResult(singleDistribution, params),
    double: getBinaryResult(doubleDistribution, params, threshold),
    second: getBinaryResult(secondDistribution, params, threshold),
  }
}
