export type ValidationResult = true | string

export type ValidationRule = (value: unknown) => ValidationResult

export interface SafeIntegerRuleOptions {
  requiredMessage?: string
  integerMessage?: string
  min?: number
  minMessage?: string
  max?: number
  maxMessage?: string
}

function isEmpty(value: unknown): boolean {
  return value === '' || value === null || value === undefined
}

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value)
}

/**
 * Build Vuetify-compatible rules for a safe integer field.
 * Domain-specific messages are supplied by the consumer so this helper does
 * not impose labels or user-facing wording on a feature.
 */
export function createSafeIntegerRules({
  requiredMessage = '値を入力して下さい。',
  integerMessage = '整数値として下さい。',
  min,
  minMessage = '値が小さすぎます。',
  max,
  maxMessage = '値が大きすぎます。',
}: SafeIntegerRuleOptions = {}): ValidationRule[] {
  const rules: ValidationRule[] = [
    (value) => !isEmpty(value) || requiredMessage,
    (value) => isSafeInteger(value) || integerMessage,
  ]

  if (min !== undefined) {
    rules.push(
      (value) => (isSafeInteger(value) && value >= min) || minMessage,
    )
  }

  if (max !== undefined) {
    rules.push(
      (value) => (isSafeInteger(value) && value <= max) || maxMessage,
    )
  }

  return rules
}
