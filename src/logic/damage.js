// src/logic/damage.js
import dr from '@/assets/data/dr.json';
import d10 from '@/assets/data/d10.json';
import { subDistribution, sumDistribution } from '@/utils/fft';
import { getExpectedValue, MAX_VALUE } from '@/utils/math';

/**
 * 与えられた達成値分布・攻撃力・防御力の下でのダメージの分布・上側確率を計算します。
 * @param {Object} score - 達成値分布
 * @param {Object} attack - 攻撃力設定 {dice, value, kazanari}
 * @param {Object} defence - 防御力設定 {dice, value}
 * @returns {Object} ダメージ分布
 */
export function getDamage(score, attack, defence) {
    const scoreActionDistribution = score.action.distribution.slice();
    const scoreReactionUpperTailProbability = score.reaction.upperTailProbability.slice();

    let distribution = Array(MAX_VALUE).fill(0);
    let upperTailProbability = Array(MAX_VALUE).fill(0);
    
    // 失敗率を計算
    let failureRate = 0;
    for (let i = 0; i < MAX_VALUE; i++) {
        failureRate += scoreActionDistribution[i] * scoreReactionUpperTailProbability[i];
    }

    // ダメージロールの出目の分布を計算
    const dr_kazanari = dr[attack.kazanari];
    for (let i = 0; i < MAX_VALUE; i++) {
        let sum = 0;
        const dr_kazanari_i = dr_kazanari[i];
        const attack_dice = attack.dice;
        // ※計算負荷軽減のためループ内変数を最適化余地ありだが、まずは移植
        for (let j = 0; j < MAX_VALUE; j++) {
            sum += scoreActionDistribution[j] * (1.0 - scoreReactionUpperTailProbability[j]) * dr_kazanari_i[Math.floor(j / 10) + 1 + attack_dice];
        }
        distribution[i] = sum;
    }

    const valueDiff = attack.value - defence.value;

    // 攻撃力固定値-防御力固定値が正の場合
    if (valueDiff > 0) {
        const lowerFill = Array(valueDiff).fill(0);
        const main = distribution.slice(0, MAX_VALUE - valueDiff);
        const upperProtrusion = distribution.slice(MAX_VALUE - valueDiff).reduce((sum, element) => sum + element, 0);
        distribution = lowerFill.concat(main);
        distribution[MAX_VALUE - 1] += upperProtrusion;
    }
    // 防御力ダイスの出目の分布を減算
    if (defence.dice > 0) {
        distribution = subDistribution(distribution, d10[defence.dice]);
    }
    // 攻撃力固定値-防御力固定値が負の場合
    if (valueDiff < 0) {
        const absDiff = -valueDiff;
        const lowerProtrusion = distribution.slice(0, absDiff).reduce((sum, element) => sum + element, 0);
        const main = distribution.slice(absDiff);
        const upperFill = Array(absDiff).fill(0);
        distribution = main.concat(upperFill);
        distribution[0] += lowerProtrusion;
    }

    // 攻撃に失敗したらダメージは0
    distribution[0] += failureRate;

    // 上側確率を計算
    upperTailProbability[0] = 1.0;
    for (let i = 1; i < MAX_VALUE; i++) {
        upperTailProbability[i] = upperTailProbability[i - 1] - distribution[i - 1];
    }

    return {
        distribution: distribution,
        upperTailProbability: upperTailProbability,
    };
}

/**
 * 与えられたダメージ分布の期待値を計算します。
 * @param {Object} damage
 * @returns {Object} { expectedValue }
 */
export function getDamageSummary(damage) {
    const expectedValue = getExpectedValue(damage.distribution);
    return { expectedValue: expectedValue };
}

/**
 * ダメージ合計の分布を計算します。
 * @param {Array} combos - コンボ情報の配列
 * @returns {Object} 合計ダメージ分布
 */
export function getTotalDamage(combos) {
    let distribution = Array(MAX_VALUE).fill(0);
    distribution[0] = 1.0;
    
    combos.forEach((value) => {
        if (value.data.damage.distribution !== null) {
            distribution = sumDistribution(distribution, value.data.damage.distribution);
        }
    });

    let upperTailProbability = Array(MAX_VALUE).fill(0);
    upperTailProbability[0] = 1.0;
    for (let i = 1; i < MAX_VALUE; i++) {
        upperTailProbability[i] = upperTailProbability[i - 1] - distribution[i - 1];
    }

    return { distribution: distribution, upperTailProbability: upperTailProbability };
}