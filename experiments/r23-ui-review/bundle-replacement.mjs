function assertReplacementArguments(source, from, to) {
  if (typeof source !== 'string' || typeof from !== 'string' || typeof to !== 'string') {
    throw new TypeError('bundle replacement expects string source, from, and to values')
  }
  if (from.length === 0) {
    throw new Error('bundle replacement target must not be empty')
  }
}

export function applyBundleReplacement(source, { from, to }) {
  assertReplacementArguments(source, from, to)
  const replacementCount = source.split(from).length - 1
  return {
    source: source.replaceAll(from, to),
    replacementCount,
  }
}

export function validateBundleReplacementStats(stats, { variantId, scenarioId } = {}) {
  if (stats === null || stats === undefined) {
    return null
  }
  if (stats.replacementCount !== 1) {
    const context = [variantId, scenarioId].filter(Boolean).join(' / ')
    const prefix = context.length > 0 ? `${context}: ` : ''
    throw new Error(`${prefix}expected exactly 1 bundle replacement, got ${stats.replacementCount}`)
  }
  return stats
}
