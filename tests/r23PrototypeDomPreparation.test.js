import { describe, expect, it } from 'vitest'

import { validateDomPreparationResult } from '../experiments/r23-ui-review/prototype-contracts.mjs'

describe('R23 prototype semantic DOM contracts', () => {
  it('accepts the Check marker counts', () => {
    expect(validateDomPreparationResult(
      {
        advancedCount: 1,
        settingGroupCount: 1,
        compoundGroupCount: 0,
        shortPageContentCount: 0,
      },
      { advancedExpected: 1, settingExpected: 1 },
      'check',
    )).toEqual({
      advancedCount: 1,
      settingGroupCount: 1,
      compoundGroupCount: 0,
      shortPageContentCount: 0,
    })
  })

  it('accepts the Attack marker counts', () => {
    expect(validateDomPreparationResult(
      {
        advancedCount: 2,
        settingGroupCount: 2,
        compoundGroupCount: 0,
        shortPageContentCount: 0,
      },
      { advancedExpected: 2, settingExpected: 2 },
      'attack',
    ).advancedCount).toBe(2)
  })

  it('rejects unexpected marker counts', () => {
    expect(() => validateDomPreparationResult(
      { advancedCount: 2, settingGroupCount: 1, compoundGroupCount: 0, shortPageContentCount: 0 },
      { advancedExpected: 1 },
      'check',
    )).toThrow('advancedCount expected 1, got 2')
  })

  it('requires a synthetic short-page marker', () => {
    expect(() => validateDomPreparationResult(
      { advancedCount: 0, settingGroupCount: 0, compoundGroupCount: 0, shortPageContentCount: 0 },
      { shortPage: true },
      'footer-short',
    )).toThrow('short-page content marker is missing')
  })
})
