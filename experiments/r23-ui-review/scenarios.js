export const VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1280, height: 900 }),
  mobile: Object.freeze({ width: 390, height: 844 }),
})

export const SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'check-desktop-ordinary',
    route: '/check',
    viewport: 'desktop',
    screenshot: '01-check-desktop-ordinary.png',
    initialCanvases: 1,
    expectedCanvases: 1,
    steps: Object.freeze([]),
  }),
  Object.freeze({
    id: 'check-mobile-ordinary',
    route: '/check',
    viewport: 'mobile',
    screenshot: '02-check-mobile-ordinary.png',
    initialCanvases: 1,
    expectedCanvases: 1,
    steps: Object.freeze([]),
  }),
  Object.freeze({
    id: 'check-desktop-upper-tail',
    route: '/check',
    viewport: 'desktop',
    screenshot: '03-check-desktop-upper-tail.png',
    initialCanvases: 1,
    expectedCanvases: 1,
    steps: Object.freeze([
      Object.freeze({
        type: 'select',
        label: '表示モード',
        option: '達成値がX以上となる確率を表示',
      }),
    ]),
  }),
  Object.freeze({
    id: 'check-mobile-upper-tail',
    route: '/check',
    viewport: 'mobile',
    screenshot: '04-check-mobile-upper-tail.png',
    initialCanvases: 1,
    expectedCanvases: 1,
    steps: Object.freeze([
      Object.freeze({
        type: 'select',
        label: '表示モード',
        option: '達成値がX以上となる確率を表示',
      }),
    ]),
  }),
  Object.freeze({
    id: 'attack-desktop-single',
    route: '/attack',
    viewport: 'desktop',
    screenshot: '05-attack-desktop-single.png',
    initialCanvases: 2,
    expectedCanvases: 2,
    steps: Object.freeze([]),
  }),
  Object.freeze({
    id: 'attack-mobile-single',
    route: '/attack',
    viewport: 'mobile',
    screenshot: '06-attack-mobile-single.png',
    initialCanvases: 2,
    expectedCanvases: 2,
    steps: Object.freeze([]),
  }),
  Object.freeze({
    id: 'attack-desktop-multi-combo',
    route: '/attack',
    viewport: 'desktop',
    screenshot: '07-attack-desktop-multi-combo.png',
    initialCanvases: 2,
    expectedCanvases: 2,
    steps: Object.freeze([
      Object.freeze({ type: 'click', role: 'button', name: 'コンボを追加' }),
    ]),
  }),
  Object.freeze({
    id: 'attack-mobile-multi-combo',
    route: '/attack',
    viewport: 'mobile',
    screenshot: '08-attack-mobile-multi-combo.png',
    initialCanvases: 2,
    expectedCanvases: 2,
    steps: Object.freeze([
      Object.freeze({ type: 'click', role: 'button', name: 'コンボを追加' }),
    ]),
  }),
  Object.freeze({
    id: 'backtrack-desktop',
    route: '/backtrack',
    viewport: 'desktop',
    screenshot: '09-backtrack-desktop.png',
    initialCanvases: 3,
    expectedCanvases: 3,
    steps: Object.freeze([]),
  }),
  Object.freeze({
    id: 'backtrack-mobile',
    route: '/backtrack',
    viewport: 'mobile',
    screenshot: '10-backtrack-mobile.png',
    initialCanvases: 3,
    expectedCanvases: 3,
    steps: Object.freeze([]),
  }),
  Object.freeze({
    id: 'backtrack-mobile-livingdead',
    route: '/backtrack',
    viewport: 'mobile',
    screenshot: '11-backtrack-mobile-livingdead.png',
    initialCanvases: 3,
    expectedCanvases: 3,
    steps: Object.freeze([
      Object.freeze({
        type: 'select',
        label: 'バックトラックに影響するDロイス',
        option: '屍人',
      }),
    ]),
  }),
])

export function validateScenarioDefinitions(
  scenarios = SCENARIOS,
  viewports = VIEWPORTS,
) {
  const errors = []
  const ids = new Set()
  const screenshots = new Set()
  for (const scenario of scenarios) {
    if (ids.has(scenario.id)) {
      errors.push(`duplicate scenario id: ${scenario.id}`)
    }
    ids.add(scenario.id)
    if (!/^\/[a-z-]+$/.test(scenario.route)) {
      errors.push(`invalid route for ${scenario.id}: ${scenario.route}`)
    }
    if (!Object.hasOwn(viewports, scenario.viewport)) {
      errors.push(`unknown viewport for ${scenario.id}: ${scenario.viewport}`)
    }
    if (screenshots.has(scenario.screenshot)) {
      errors.push(`duplicate screenshot: ${scenario.screenshot}`)
    }
    screenshots.add(scenario.screenshot)
    if (!/^\d{2}-[a-z0-9-]+\.png$/.test(scenario.screenshot)) {
      errors.push(`invalid screenshot name for ${scenario.id}: ${scenario.screenshot}`)
    }
    if (!Number.isInteger(scenario.expectedCanvases) || scenario.expectedCanvases < 1) {
      errors.push(`invalid expected canvas count for ${scenario.id}`)
    }
    if (!Number.isInteger(scenario.initialCanvases) || scenario.initialCanvases < 1) {
      errors.push(`invalid initial canvas count for ${scenario.id}`)
    }
    if (scenario.initialCanvases > scenario.expectedCanvases) {
      errors.push(`initial canvas count exceeds final count for ${scenario.id}`)
    }
    if (!Array.isArray(scenario.steps)) {
      errors.push(`steps must be an array for ${scenario.id}`)
    }
  }
  return errors
}

const definitionErrors = validateScenarioDefinitions()
if (definitionErrors.length > 0) {
  throw new Error(`Invalid R23 scenario definitions:\n${definitionErrors.join('\n')}`)
}
