// src/logic/check.js
import dx from '@/assets/data/dx.json';
import { sumDistribution } from '@/utils/fft';
import { getExpectedValue, MAX_VALUE } from '@/utils/math';

/**
 * 与えられたダイス数、クリティカル値、判定固定値の下での達成値の分布・上側確率を計算します。
 * @param {Object} params
 * @param {number} params.dice - 判定に用いるダイス数 (0-99)
 * @param {number} params.critical - 判定のクリティカル値 (2-11)
 * @param {number} params.skill - 判定の固定値 (-999-999)
 * @param {number} params.yousei - 《妖精の手》回数 (0-9)
 * @param {number} params.shihai - 《支配の領域》対象ダイス数 (0-19)
 * @param {boolean} [fix=false] - 達成値が技能値に固定されるならtrue
 * @returns {Object} score - 分布(distribution)と上側確率(upperTailProbability)
 */
export function getScore(params, fix = false) {
    let distribution = Array(MAX_VALUE).fill(0);
    let upperTailProbability = Array(MAX_VALUE).fill(0);

    if (fix) {
        distribution[params.skill] = 1.0;
        for (let i = 0; i <= params.skill; i++) {
            upperTailProbability[i] = 1.0;
        }
    } else {
        // ダイスの出目を計算
        const diceResultInfo = dx[params.shihai][params.dice][params.critical - 2];
        const diceResultLowerFill = Array(diceResultInfo.pre).fill(0);
        const diceResultUpperFill = Array(diceResultInfo.post).fill(0);
        let diceResult = diceResultLowerFill.concat(diceResultInfo.val).concat(diceResultUpperFill);

        // 《妖精の手》等による振り直し
        if (params.yousei >= 0) {
            const youseiInfo = dx[0][1][params.critical - 2];
            const youseiLowerFill = Array(youseiInfo.pre).fill(0);
            const youseiUpperFill = Array(youseiInfo.post).fill(0);
            const youseiResult = youseiLowerFill.concat(youseiInfo.val).concat(youseiUpperFill);
            
            for (let i = 0; i < params.yousei; i++) {
                // 最後のダイスの出目を10に変更
                diceResult = Array.from({ length: MAX_VALUE }, (_, k) => k % 10 === 0 ? diceResult.slice(Math.max(0, k - 9), k + 1).reduce((sum, element) => sum + element, 0.0) : 0.0);
                diceResult[MAX_VALUE - 1] = 1.0 - diceResult.slice(0, MAX_VALUE - 1).reduce((sum, element) => sum + element, 0);
                
                // クリティカル値が10以下なら振り足し
                if (params.critical <= 10) {
                    diceResult = sumDistribution(diceResult, youseiResult);
                }
            }
        }

        // ファンブルの確率を計算
        const fumble = diceResult[0] + diceResult[1];
        diceResult[0] = 0;
        diceResult[1] = 0;

        if (params.skill < 0) {
            // 技能値が負の場合
            const lowerProtrusion = diceResult.slice(0, -params.skill).reduce((sum, element) => sum + element, 0);
            const main = diceResult.slice(-params.skill);
            const upperFill = Array(-params.skill).fill(0);
            distribution = main.concat(upperFill);
            distribution[0] += lowerProtrusion + fumble;
        } else if (params.skill > 0) {
            // 技能値が正の場合
            const lowerFill = Array(params.skill).fill(0);
            const main = diceResult.slice(0, MAX_VALUE - params.skill);
            const upperProtrusion = diceResult.slice(MAX_VALUE - params.skill).reduce((sum, element) => sum + element, 0);
            distribution = lowerFill.concat(main);
            distribution[0] += fumble;
            distribution[MAX_VALUE - 1] += upperProtrusion;
        } else {
            // 技能値が0の場合
            distribution = diceResult.slice();
            distribution[0] += fumble;
        }

        // 上側確率を計算
        upperTailProbability[0] = 1.0;
        for (let i = 1; i < MAX_VALUE; i++) {
            upperTailProbability[i] = upperTailProbability[i - 1] - distribution[i - 1];
        }
    }

    return {
        distribution: distribution,
        upperTailProbability: upperTailProbability
    };
}

/**
 * 与えられた達成値分布の期待値・成功率を計算します。
 * @param {Object} score - アクション側とリアクション側の分布情報
 * @param {Object} dfclty - 難易度設定 {opposed: boolean, target: number}
 * @returns {Object} 期待値と成功率のサマリ
 */
export function getScoreSummary(score, dfclty = { opposed: true, target: 0 }) {
    let actionExpectedValue;
    let actionSuccessRate;
    let reactionExpectedValue;
    let reactionSuccessRate;

    if (dfclty.opposed && score.action.distribution && score.action.upperTailProbability && score.reaction.distribution && score.reaction.upperTailProbability) {
        // 対決判定
        actionExpectedValue = getExpectedValue(score.action.distribution);
        actionSuccessRate = 0;
        for (let i = 0; i < MAX_VALUE; i++) {
            actionSuccessRate += score.action.distribution[i] * (1 - score.reaction.upperTailProbability[i]);
        }
        actionSuccessRate = Math.round(actionSuccessRate * 1000) / 10;
        reactionExpectedValue = getExpectedValue(score.reaction.distribution);
        reactionSuccessRate = Math.round((100 - actionSuccessRate) * 10) / 10;
    } else if (!dfclty.opposed && score.action.distribution && score.action.upperTailProbability) {
        // 難易度判定
        actionExpectedValue = getExpectedValue(score.action.distribution);
        actionSuccessRate = Math.round(score.action.upperTailProbability[dfclty.target] * 1000) / 10;
        reactionExpectedValue = 0;
        reactionSuccessRate = 0;
    }

    return {
        action: {
            expectedValue: actionExpectedValue,
            successRate: actionSuccessRate,
        },
        reaction: {
            expectedValue: reactionExpectedValue,
            successRate: reactionSuccessRate,
        }
    };
}