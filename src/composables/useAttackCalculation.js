// src/composables/useAttackCalculation.js
import { computed } from 'vue';
import { getScore, getScoreSummary } from '@/logic/check';
import { getDamage, getDamageSummary } from '@/logic/damage';
import * as v from '@/utils/validators';

/**
 * 攻撃に関連する計算ロジックを提供します
 * @param {Object} params - 入力パラメータ (reactive)
 */
export function useAttackCalculation(params) {

    // 1. バリデーションチェック (Guard Clause)
    // どれか一つでも不正な値があれば false を返す
    const isValidScoreParams = computed(() => {
        const s = params.score;
        return v.isValidDice(s.dice) &&
               v.isValidCritical(s.critical) &&
               v.isValidSkill(s.skill) &&
               v.isValidYousei(s.yousei) &&
               v.isValidShihai(s.shihai) &&
               v.isExclusiveYouseiShihai(s.yousei, s.shihai);
    });

    const isValidDamageParams = computed(() => {
        const d = params.damage;
        return v.isValidAttackDice(d.dice) &&
               v.isValidAttackValue(d.value) &&
               v.isValidKazanari(d.kazanari);
    });

    // 2. 計算ロジック (Computed)
    // isValidがfalseの時は null を返し、UI側でハンドリングするか、
    // あるいは「計算しない」ことで直前の値を維持する実装も可能です。
    // ここではシンプルに null を返します。

    const score = computed(() => {
        if (!isValidScoreParams.value) return null;
        return getScore(params.score);
    });

    const scoreSummary = computed(() => {
        if (!score.value) return null;
        // リアクション側のデータが必要な場合は引数で受け取る設計に拡張できますが
        // 現状の Attack.vue の構造に合わせて action 側のみ計算します
        return getScoreSummary({ action: score.value, reaction: null }, { opposed: false, target: 0 });
    });

    const damage = computed(() => {
        // ダメージ計算には「判定結果(score)」と「ダメージ設定」の両方が必要
        if (!score.value || !isValidDamageParams.value) return null;
        
        // ※防御側の情報は Attack.vue 側で結合されるため、ここではダミーまたはnullで計算
        // getDamage の実装依存ですが、action側の分布さえあれば計算できる場合:
        const dummyReaction = { distribution: [], upperTailProbability: [] };
        const dummyDefence = { dice: 0, value: 0 };
        
        return getDamage(
            { action: score.value, reaction: dummyReaction },
            params.damage,
            dummyDefence
        );
    });

    const damageSummary = computed(() => {
        if (!damage.value) return null;
        return getDamageSummary(damage.value);
    });

    return {
        score,
        scoreSummary,
        damage,
        damageSummary
    };
}