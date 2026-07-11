// src/utils/validators.js

/**
 * 単純な整数チェック（範囲なし）
 * @param {number|string} val - 入力値
 * @returns {boolean} 有効な整数ならtrue
 */
const isInteger = (val) => {
    if (val === "" || val === null || val === undefined) return false;
    return Number.isInteger(Number(val));
};

/**
 * 範囲付きの整数チェック
 * @param {number|string} val - 入力値
 * @param {number} min - 最小値
 * @param {number} max - 最大値
 * @returns {boolean} 有効な範囲の整数ならtrue
 */
const isIntegerInRange = (val, min, max) => {
    if (val === "" || val === null || val === undefined) return false;
    const num = Number(val);
    return Number.isInteger(num) && num >= min && num <= max;
};

// --- 個別のルール定義 ---

// --- 判定用ルール ---
export const isValidDice = (v) => isIntegerInRange(v, 0, 99);
export const isValidCritical = (v) => isIntegerInRange(v, 2, 11);
export const isValidSkill = (v) => isIntegerInRange(v, -999, 999);
export const isValidTarget = (v) => isIntegerInRange(v, 0, 999);
export const isValidYousei = (v) => isIntegerInRange(v, 0, 9);
export const isValidShihai = (v) => isIntegerInRange(v, 0, 19);
export const isExclusiveYouseiShihai = (yousei, shihai) => {
    return yousei === 0 || shihai === 0;
};

// --- 攻撃用ルール ---
export const isValidAttackDice = (v) => isIntegerInRange(v, 0, 99);
export const isValidAttackValue = (v) => isIntegerInRange(v, -999, 999);
export const isValidKazanari = (v) => isIntegerInRange(v, 0, 9);

// --- バックトラック用ルール ---
export const isValidEncroachment = (v) => isInteger(v);
export const isValidLois = (v) => isIntegerInRange(v, 0, 7);
export const isValidElois = (v) => isIntegerInRange(v, 0, 99);
export const isValidReductionDice = (v) => isIntegerInRange(v, 0, 99);
export const isValidReductionValue = (v) => isIntegerInRange(v, 0, 999);