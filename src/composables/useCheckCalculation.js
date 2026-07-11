// src/composables/useCheckCalculation.js

import { computed } from 'vue';
import { getScore, getScoreSummary } from '@/logic/check';
import * as v from '@/utils/validators';

export function useCheckCalculation(params, dfclty) {

    // 1. バリデーション (Guard Clause)
    const isValid = computed(() => {
        // アクション側の必須チェック
        const actionValid = 
            v.isValidDice(params.action.dice) &&
            v.isValidCritical(params.action.critical) &&
            v.isValidSkill(params.action.skill);
        
        // リアクション側 (対決時のみチェック)
        const reactionValid = !dfclty.opposed || (
            v.isValidDice(params.reaction.dice) &&
            v.isValidCritical(params.reaction.critical) &&
            v.isValidSkill(params.reaction.skill)
        );

        // 難易度 (非対決時のみチェック)
        const targetValid = dfclty.opposed || v.isValidTarget(dfclty.target);

        return actionValid && reactionValid && targetValid;
    });

    // 2. スコア計算 (Action / Reaction)
    const score = computed(() => {
        if (!isValid.value) return null;

        const actionScore = getScore(params.action);
        // 対決でない場合、reactionScoreは不要（またはダミー）
        const reactionScore = dfclty.opposed ? getScore(params.reaction) : null;

        return {
            action: actionScore,
            reaction: reactionScore
        };
    });

    // 3. サマリー計算 (成功率など)
    const scoreSummary = computed(() => {
        if (!score.value || !score.value.action) return null;
        
        // 対決時は reactionScore も必要
        if (dfclty.opposed && !score.value.reaction) return null;

        return getScoreSummary(score.value, dfclty);
    });

    return {
        score,
        scoreSummary
    };
}