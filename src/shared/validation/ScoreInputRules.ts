import {
  INPUT_DOMAIN,
  isSafeInteger,
  type ScoreFeatureInput,
} from '@/domain/InputDomain'

import {
  createSafeIntegerRules,
  type ValidationRule,
} from './IntegerRules'

export interface ScoreFieldRuleMessages {
  dice?: Partial<SafeIntegerMessageSet>
  critical?: Partial<SafeIntegerMessageSet>
  skill?: Partial<SafeIntegerMessageSet>
  yousei?: Partial<SafeIntegerMessageSet>
  shihai?: Partial<SafeIntegerMessageSet>
}

export interface SafeIntegerMessageSet {
  requiredMessage: string
  integerMessage: string
  minMessage: string
  maxMessage: string
}

export interface ScoreFieldRules {
  dice: ValidationRule[]
  critical: ValidationRule[]
  skill: ValidationRule[]
  yousei: ValidationRule[]
  shihai: ValidationRule[]
}

const DEFAULT_MESSAGES: Record<keyof ScoreFieldRules, SafeIntegerMessageSet> = {
  dice: {
    requiredMessage: 'ダイス数を入力して下さい。',
    integerMessage: 'ダイス数は整数値として下さい。',
    minMessage: 'ダイス数は0以上として下さい。',
    maxMessage: 'ダイス数は上限以下として下さい。',
  },
  critical: {
    requiredMessage: 'クリティカル値を入力して下さい。',
    integerMessage: 'クリティカル値は整数値として下さい。',
    minMessage: 'クリティカル値は2以上として下さい。',
    maxMessage: 'クリティカル値は11以下として下さい。',
  },
  skill: {
    requiredMessage: '技能値を入力して下さい。',
    integerMessage: '技能値は整数値として下さい',
    minMessage: '技能値は下限以上として下さい。',
    maxMessage: '技能値は上限以下として下さい。',
  },
  yousei: {
    requiredMessage: '《妖精の手》等の回数を入力して下さい。',
    integerMessage: '《妖精の手》等の回数は整数値として下さい。',
    minMessage: '《妖精の手》等の回数は0以上として下さい。',
    maxMessage: '《妖精の手》等の回数は上限以下として下さい。',
  },
  shihai: {
    requiredMessage: '《支配の領域》の対象となるダイス数を入力して下さい。',
    integerMessage: '《支配の領域》の対象となるダイス数は整数値として下さい。',
    minMessage: '《支配の領域》の対象となるダイス数は0以上として下さい。',
    maxMessage: '《支配の領域》の対象となるダイス数は上限以下として下さい。',
  },
}

function messagesFor(
  field: keyof ScoreFieldRules,
  overrides: Partial<SafeIntegerMessageSet> | undefined,
): SafeIntegerMessageSet {
  return { ...DEFAULT_MESSAGES[field], ...overrides }
}

/**
 * Build the five independent Score field rules. Cross-field feature support
 * is intentionally provided by createScoreFeatureCompatibilityRule instead.
 */
export function createScoreFieldRules(
  messages: ScoreFieldRuleMessages = {},
): ScoreFieldRules {
  const dice = messagesFor('dice', messages.dice)
  const critical = messagesFor('critical', messages.critical)
  const skill = messagesFor('skill', messages.skill)
  const yousei = messagesFor('yousei', messages.yousei)
  const shihai = messagesFor('shihai', messages.shihai)

  return {
    dice: createSafeIntegerRules({
      ...dice,
      min: 0,
    }),
    critical: createSafeIntegerRules({
      ...critical,
      min: INPUT_DOMAIN.critical.min,
      max: INPUT_DOMAIN.critical.max,
    }),
    skill: createSafeIntegerRules({
      ...skill,
    }),
    yousei: createSafeIntegerRules({
      ...yousei,
      min: 0,
    }),
    shihai: createSafeIntegerRules({
      ...shihai,
      min: 0,
    }),
  }
}

export interface ScoreFeatureCompatibilityRuleOptions {
  field: 'yousei' | 'shihai'
  getScore: () => ScoreFeatureInput
  message?: string
}

const DEFAULT_COMPATIBILITY_MESSAGE =
  '《妖精の手》と《支配の領域》の同時利用には対応していません。'

/**
 * Build the feature-support rule for one side of the yousei/shihai pair.
 * Keeping it separate lets each form preserve its existing error placement.
 */
export function createScoreFeatureCompatibilityRule({
  field,
  getScore,
  message = DEFAULT_COMPATIBILITY_MESSAGE,
}: ScoreFeatureCompatibilityRuleOptions): ValidationRule {
  const otherField = field === 'yousei' ? 'shihai' : 'yousei'

  return (value) => {
    if (!isSafeInteger(value) || value <= 0) {
      return true
    }

    const score = getScore() ?? {}
    const otherValue = score[otherField]
    return otherValue === 0 || message
  }
}
