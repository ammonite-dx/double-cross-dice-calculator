// src/composables/useBacktrackCalculation.js

import { computed } from 'vue';
import { getFinalEncroachment } from '@/logic/backtrack';
import * as v from '@/utils/validators';

export function useBacktrackCalculation(params) {
    
    // ガード節
    const isValid = computed(() => {
        return v.isValidEncroachment(params.encroachment) &&
               v.isValidLois(params.lois) &&
               v.isValidElois(params.elois) &&
               v.isValidReductionDice(params.dice) &&
               v.isValidReductionValue(params.value);
    });

    // 計算結果
    const finalEncroachment = computed(() => {
        if (!isValid.value) return null;
        return getFinalEncroachment(params);
    });

    return {
        finalEncroachment
    };
}