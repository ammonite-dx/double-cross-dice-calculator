import { describe, expect, it } from 'vitest'

import {
  createDisplayRangeRules,
} from '../src/shared/validation/DisplayRangeRules'
import {
  createSafeIntegerRules,
} from '../src/shared/validation/IntegerRules'
import {
  createScoreFeatureCompatibilityRule,
  createScoreFieldRules,
} from '../src/shared/validation/ScoreInputRules'

function validate(rules, value) {
  return rules.map((rule) => rule(value))
}

function expectValid(rules, value) {
  expect(validate(rules, value).every((result) => result === true)).toBe(true)
}

function expectInvalid(rules, value) {
  expect(validate(rules, value).some((result) => result !== true)).toBe(true)
}

describe('shared integer validation rules', () => {
  it('keeps required and safe-integer checks separate from range checks', () => {
    const rules = createSafeIntegerRules({
      requiredMessage: 'required',
      integerMessage: 'integer',
      min: 0,
      minMessage: 'minimum',
    })

    expect(rules[0]('')).toBe('required')
    expect(rules[1](1.5)).toBe('integer')
    expect(rules[2](-1)).toBe('minimum')
    expectValid(rules, 0)
    expectValid(rules, Number.MAX_SAFE_INTEGER)
  })
})

describe('shared score input rules', () => {
  it('preserves the canonical score domain', () => {
    const rules = createScoreFieldRules()

    expectValid(rules.dice, 0)
    expectInvalid(rules.dice, -1)
    expectValid(rules.critical, 2)
    expectValid(rules.critical, 11)
    expectInvalid(rules.critical, 1)
    expectInvalid(rules.critical, 12)
    expectValid(rules.skill, -100)
    expectValid(rules.yousei, Number.MAX_SAFE_INTEGER)
    expectValid(rules.shihai, Number.MAX_SAFE_INTEGER)
  })

  it('reports the unsupported yousei/shihai combination on the selected field', () => {
    const score = { yousei: 1, shihai: 1 }
    const youseiRule = createScoreFeatureCompatibilityRule({
      field: 'yousei',
      getScore: () => score,
    })
    const shihaiRule = createScoreFeatureCompatibilityRule({
      field: 'shihai',
      getScore: () => score,
    })

    expectInvalid([youseiRule], score.yousei)
    expectInvalid([shihaiRule], score.shihai)
    expectValid([youseiRule], 0)
    expectValid([shihaiRule], 0)
  })
})

describe('shared display range rules', () => {
  it('accepts arbitrary safe ranges, including a single point', () => {
    const range = { min: 0, max: 0 }
    const rules = createDisplayRangeRules(() => range)

    expectValid(rules.min, 0)
    expectValid(rules.max, 0)

    range.min = 0
    range.max = 20000
    expectValid(rules.min, 0)
    expectValid(rules.max, 20000)
  })

  it('rejects malformed coordinates but does not apply a fixed upper bound', () => {
    const range = { min: 0, max: 100 }
    const rules = createDisplayRangeRules({ getRange: () => range })

    expectInvalid(rules.min, -1)
    expectInvalid(rules.max, Number.MAX_SAFE_INTEGER + 1)
    expectInvalid(rules.min, 101)
    expectInvalid(rules.max, -1)

    range.max = 20000
    expectValid(rules.max, 20000)
  })
})
