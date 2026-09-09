import { describe, expect, it } from 'vitest'

import {
  SCENARIOS,
  VIEWPORTS,
  validateScenarioDefinitions,
} from '../experiments/r23-ui-review/scenarios.js'
import {
  STYLE_METRIC_SCENARIOS,
  createMetricDelta,
} from '../experiments/r23-ui-review/style-metrics.js'

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

  it('uses a distinct accepted input for the second combo', () => {
    for (const scenarioId of [
      'attack-desktop-multi-combo',
      'attack-mobile-multi-combo',
    ]) {
      const scenario = SCENARIOS.find(({ id }) => id === scenarioId)
      expect(scenario.steps).toEqual(expect.arrayContaining([
        { type: 'fill', label: 'ダイス数', index: 2, value: 4 },
        { type: 'fill', label: 'クリティカル値', index: 2, value: 8 },
        { type: 'fill', label: '技能値', index: 2, value: 3 },
        { type: 'fill', label: '攻撃力', index: 1, value: 2 },
        { type: 'fill', target: 'attack-damage-value', comboIndex: 1, value: 4 },
      ]))
    }
  })

  it('keeps style metric scenarios semantic and within the baseline matrix', () => {
    expect(STYLE_METRIC_SCENARIOS).toEqual([
      expect.objectContaining({
        id: 'check-desktop-ordinary',
        route: '/check',
        viewport: 'desktop',
        page: 'check',
      }),
      expect.objectContaining({
        id: 'check-mobile-ordinary',
        route: '/check',
        viewport: 'mobile',
        page: 'check',
      }),
      expect.objectContaining({
        id: 'attack-desktop-single',
        route: '/attack',
        viewport: 'desktop',
        page: 'attack',
      }),
      expect.objectContaining({
        id: 'attack-mobile-single',
        route: '/attack',
        viewport: 'mobile',
        page: 'attack',
      }),
    ])
  })

  it('computes diagnostic deltas without treating differences as failures', () => {
    expect(createMetricDelta(
      { box: { x: 10, width: 100 }, text: 'same' },
      { box: { x: 12.25, width: 100 }, text: 'changed' },
    )).toEqual({
      box: { x: 2.25, width: 0 },
      text: { reference: 'same', current: 'changed' },
    })
  })
})
