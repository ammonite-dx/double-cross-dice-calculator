const SCORE_FIELDS = Object.freeze([
  'dice',
  'critical',
  'skill',
  'yousei',
  'shihai',
])

const ATTACK_DAMAGE_FIELDS = Object.freeze([
  'dice',
  'value',
  'kazanari',
])

const DEFENCE_DAMAGE_FIELDS = Object.freeze([
  'dice',
  'value',
])

function copyFields(source = {}, fields) {
  const copied = {}
  for (const field of fields) {
    copied[field] = source[field]
  }
  return copied
}

function copyScoreDraft(score = {}) {
  return copyFields(score, SCORE_FIELDS)
}

function copyAttackDamageDraft(damage = {}) {
  return copyFields(damage, ATTACK_DAMAGE_FIELDS)
}

function copyDefenceDamageDraft(damage = {}) {
  return copyFields(damage, DEFENCE_DAMAGE_FIELDS)
}

/**
 * Copy the fields owned by AttackForm without applying calculation
 * normalization. The form owns validation; this boundary owns shape and
 * alias-free snapshots.
 */
export function normalizeAttackInputDraft(draft = {}) {
  return {
    score: copyScoreDraft(draft.score),
    damage: copyAttackDamageDraft(draft.damage),
  }
}

export function createAttackInputSnapshot(draft = {}) {
  const normalized = normalizeAttackInputDraft(draft)
  return {
    score: { ...normalized.score },
    damage: { ...normalized.damage },
  }
}

/**
 * Coordinates async form validation callbacks. A ticket is valid only while
 * it is the newest ticket and the form has not been disposed.
 */
export function createLatestValidationGate() {
  let latestTicket = 0
  let disposed = false

  return {
    begin() {
      latestTicket += 1
      return latestTicket
    },
    invalidate() {
      latestTicket += 1
      return latestTicket
    },
    canCommit(ticket) {
      return !disposed && ticket === latestTicket
    },
    dispose() {
      disposed = true
      latestTicket += 1
    },
  }
}

/**
 * Copy DefenceForm's editable draft. Its score is intentionally kept in the
 * UI coordinate system until normalizeDefenceInputDraft is called after
 * validation; this matters for 《イベイジョン》's dice-to-skill conversion.
 */
export function createDefenceInputDraftSnapshot(draft = {}) {
  return {
    mode: draft.mode,
    score: copyScoreDraft(draft.score),
    damage: copyDefenceDamageDraft(draft.damage),
  }
}

/**
 * Convert a validated DefenceForm draft to the calculation coordinate system.
 * The switch preserves the existing mode-specific values and zeroing rules.
 */
export function normalizeDefenceInputDraft(draft = {}) {
  const score = draft.score ?? {}
  const damage = copyDefenceDamageDraft(draft.damage)

  switch (draft.mode) {
    case 'ドッジ':
      return {
        mode: draft.mode,
        score: copyScoreDraft(score),
        damage,
      }
    case '《イベイジョン》':
      return {
        mode: draft.mode,
        score: {
          dice: 0,
          critical: 10,
          skill: score.dice * 2 + score.skill,
          yousei: 0,
          shihai: 0,
        },
        damage,
      }
    case 'ガード・リアクション放棄':
      return {
        mode: draft.mode,
        score: {
          dice: 0,
          critical: 10,
          skill: 0,
          yousei: 0,
          shihai: 0,
        },
        damage,
      }
    default:
      return null
  }
}

/**
 * Clone a validated side snapshot before installing it in combo params.
 * Defence snapshots are already normalized, so this deliberately copies
 * rather than normalizes them a second time.
 */
export function cloneAttackSideSnapshot(side, snapshot) {
  if (side === 'action') {
    return createAttackInputSnapshot(snapshot)
  }
  if (side === 'reaction') {
    return {
      mode: snapshot.mode,
      score: { ...copyScoreDraft(snapshot.score) },
      damage: { ...copyDefenceDamageDraft(snapshot.damage) },
    }
  }
  throw new TypeError(`unsupported Attack side: ${side}`)
}

/**
 * Replace one combo side atomically and return the installed snapshot.
 */
export function replaceAttackSideSnapshot(params, side, snapshot) {
  if (params === null || typeof params !== 'object') {
    throw new TypeError('Attack params must be an object')
  }
  const nextSnapshot = cloneAttackSideSnapshot(side, snapshot)
  params[side] = nextSnapshot
  return nextSnapshot
}
