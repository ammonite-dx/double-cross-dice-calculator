export function validateDomPreparationResult(
  result,
  expected,
  context = 'R23 prototype',
) {
  if (result === null || typeof result !== 'object') {
    throw new TypeError(`${context}: DOM preparation result must be an object`)
  }
  const checks = [
    ['advancedExpected', 'advancedCount'],
    ['settingExpected', 'settingGroupCount'],
    ['compoundExpected', 'compoundGroupCount'],
  ]
  for (const [expectedKey, actualKey] of checks) {
    if (expected?.[expectedKey] === undefined) {
      continue
    }
    if (result[actualKey] !== expected[expectedKey]) {
      throw new Error(
        `${context}: ${actualKey} expected ${expected[expectedKey]}, got ${result[actualKey]}`
      )
    }
  }
  if (expected?.shortPage && result.shortPageContentCount < 1) {
    throw new Error(`${context}: short-page content marker is missing`)
  }
  return result
}
