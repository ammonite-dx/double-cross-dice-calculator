import { describe, expect, it } from 'vitest'

import {
  SCENARIOS,
  VIEWPORTS,
  validateScenarioDefinitions,
} from '../experiments/r23-ui-review/scenarios.js'

describe('R23 UI review scenario definitions', () => {
  it('has no definition errors', () => {
    expect(validateScenarioDefinitions()).toEqual([])
  })

  it('covers the required pages and viewports', () => {
    const ids = new Set(SCENARIOS.map((scenario) => scenario.id))
    expect(ids).toEqual(new Set([
      'check-desktop-ordinary',
      'check-mobile-ordinary',
      'check-desktop-upper-tail',
      'check-mobile-upper-tail',
      'attack-desktop-single',
      'attack-mobile-single',
      'attack-desktop-multi-combo',
      'attack-mobile-multi-combo',
      'backtrack-desktop',
      'backtrack-mobile',
      'backtrack-mobile-livingdead',
    ]))
    expect(VIEWPORTS.desktop).toEqual({ width: 1280, height: 900 })
    expect(VIEWPORTS.mobile).toEqual({ width: 390, height: 844 })
  })

  it('keeps screenshot names deterministic and unique', () => {
    const names = SCENARIOS.map((scenario) => scenario.screenshot)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual([
      '01-check-desktop-ordinary.png',
      '02-check-mobile-ordinary.png',
      '03-check-desktop-upper-tail.png',
      '04-check-mobile-upper-tail.png',
      '05-attack-desktop-single.png',
      '06-attack-mobile-single.png',
      '07-attack-desktop-multi-combo.png',
      '08-attack-mobile-multi-combo.png',
      '09-backtrack-desktop.png',
      '10-backtrack-mobile.png',
      '11-backtrack-mobile-livingdead.png',
    ])
  })
})
