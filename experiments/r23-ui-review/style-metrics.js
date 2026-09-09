export const STYLE_METRICS_SCHEMA_VERSION = 1

export const STYLE_METRIC_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'check-desktop-ordinary',
    route: '/check',
    viewport: 'desktop',
    page: 'check',
  }),
  Object.freeze({
    id: 'check-mobile-ordinary',
    route: '/check',
    viewport: 'mobile',
    page: 'check',
  }),
  Object.freeze({
    id: 'attack-desktop-single',
    route: '/attack',
    viewport: 'desktop',
    page: 'attack',
  }),
  Object.freeze({
    id: 'attack-mobile-single',
    route: '/attack',
    viewport: 'mobile',
    page: 'attack',
  }),
])

const STYLE_PROPERTIES = Object.freeze([
  'display',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'height',
  'minHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'gap',
  'alignItems',
  'justifyContent',
  'textAlign',
])

/**
 * Collects geometry and computed styles for stable semantic anchors. This is
 * intentionally diagnostic data: callers must not interpret it as a pass/fail
 * or pixel-perfect golden test.
 */
export async function collectStyleMetrics(page, { page: pageKind }) {
  return page.evaluate(({ kind, styleProperties }) => {
    const roundMetric = (value) => Number(value.toFixed(3))
    const readBox = (element) => {
      if (!element) {
        return null
      }
      const rect = element.getBoundingClientRect()
      return {
        x: roundMetric(rect.x),
        y: roundMetric(rect.y),
        width: roundMetric(rect.width),
        height: roundMetric(rect.height),
      }
    }
    const readStyles = (element) => {
      if (!element) {
        return null
      }
      const computed = getComputedStyle(element)
      return Object.fromEntries(
        styleProperties.map((property) => [property, computed[property]])
      )
    }
    const readElement = (element) => {
      if (!element) {
        return null
      }
      return {
        tagName: element.tagName.toLowerCase(),
        text: element.textContent?.trim() ?? '',
        box: readBox(element),
        styles: readStyles(element),
      }
    }
    const visible = (element) => {
      if (!element) {
        return false
      }
      const box = element.getBoundingClientRect()
      return box.width > 0 && box.height > 0
    }
    const findExactText = (text) => {
      const candidates = [...document.querySelectorAll('body *')]
        .filter((element) => visible(element)
          && element.textContent?.trim() === text)
      candidates.sort((left, right) => {
        const leftBox = readBox(left)
        const rightBox = readBox(right)
        if (leftBox.y !== rightBox.y) {
          return leftBox.y - rightBox.y
        }
        const leftChildren = left.querySelectorAll('*').length
        const rightChildren = right.querySelectorAll('*').length
        if (leftChildren !== rightChildren) {
          return leftChildren - rightChildren
        }
        return leftBox.width - rightBox.width
      })
      return candidates[0] ?? null
    }
    const findLabelInput = (labelText, index = 0) => {
      const labels = [...document.querySelectorAll('label')]
        .filter((label) => visible(label)
          && label.textContent?.trim() === labelText)
      const label = labels[index] ?? null
      if (!label) {
        return null
      }
      const field = label.closest('.v-field, .v-input') ?? label
      return {
        label,
        field,
        input: field.querySelector('input, textarea, [role="combobox"]'),
      }
    }
    const readField = (labelText, index = 0) => {
      const target = findLabelInput(labelText, index)
      if (!target) {
        return null
      }
      return {
        label: readElement(target.label),
        field: readElement(target.field),
        input: readElement(target.input),
      }
    }
    const readHeader = (page) => {
      const headingText = page === 'check' ? 'アクション側' : '攻撃側'
      const heading = findExactText(headingText)
      const row = heading?.closest('.v-row') ?? heading?.parentElement ?? null
      const advancedText = findExactText('高度な設定')
      const checkboxContainer = [...document.querySelectorAll(
        '.v-input, .v-selection-control, .v-checkbox-btn, [role="checkbox"]'
      )].find((element) => visible(element)
        && element.textContent?.includes('高度な設定'))
      const checkbox = checkboxContainer
        ?? advancedText?.closest('.v-col, .v-row')
          ?.querySelector('.v-selection-control, .v-checkbox-btn, [role="checkbox"]')
        ?? [...document.querySelectorAll('input[type="checkbox"]')]
          .find(visible)
        ?? null
      return {
        heading: readElement(heading),
        row: readElement(row),
        advancedText: readElement(advancedText),
        checkbox: readElement(checkbox),
      }
    }
    const readTypography = (page) => {
      const labels = page === 'check'
        ? ['アクション側', 'リアクション側', 'ダイス数', 'クリティカル値', '技能値']
        : ['攻撃側', 'ダイス数', 'クリティカル値', '技能値', '攻撃力', 'コンボ1']
      return labels.map((text) => ({
        text,
        element: readElement(findExactText(text)),
      }))
    }
    return {
      schemaVersion: 1,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      header: readHeader(kind),
      fields: {
        minimum: readField('最小値'),
        maximum: readField('最大値'),
        displayMode: readField('表示モード'),
      },
      typography: readTypography(kind),
    }
  }, { kind: pageKind, styleProperties: STYLE_PROPERTIES })
}

function roundDelta(value) {
  return Number(value.toFixed(3))
}

/**
 * Creates a JSON-safe diagnostic delta. Numeric leaves are current-reference;
 * non-numeric leaves retain both values only when they differ.
 */
export function createMetricDelta(reference, current) {
  if (typeof reference === 'number' && typeof current === 'number') {
    return roundDelta(current - reference)
  }
  if (Array.isArray(reference) && Array.isArray(current)) {
    const length = Math.max(reference.length, current.length)
    return Array.from({ length }, (_, index) => createMetricDelta(
      reference[index],
      current[index]
    ))
  }
  if (reference && typeof reference === 'object'
    && current && typeof current === 'object'
    && !Array.isArray(reference) && !Array.isArray(current)) {
    const keys = new Set([...Object.keys(reference), ...Object.keys(current)])
    return Object.fromEntries([...keys].map((key) => [
      key,
      createMetricDelta(reference[key], current[key]),
    ]))
  }
  if (Object.is(reference, current)) {
    return null
  }
  return { reference: reference ?? null, current: current ?? null }
}
