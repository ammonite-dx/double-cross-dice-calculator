<script setup>

    import { watch } from 'vue';
    import { getDamage,getDamageSummary } from '@/data/DamageCalculator';
    import { loadDrAsset,loadDxAsset } from '@/data/PrecomputedDataRepository';
    import { getScore,getScoreSummary } from '@/data/ScoreCalculator';
    import AttackForm from './AttackForm.vue';
    import DefenceForm from './DefenceForm.vue';

    const props = defineProps(['comboData','comboColor','showDetails']);
    const calculationRevision = {action: 0, reaction: 0};
    let damageRevision = 0;
    const updateDamage = async () => {
        const revision = ++damageRevision;
        const kazanari = props.comboData.params.action.damage.kazanari;

        try {
            await loadDrAsset(kazanari);
            if (revision !== damageRevision) {
                return;
            }
            props.comboData.damage = getDamage(props.comboData.score, props.comboData.params.action.damage, props.comboData.params.reaction.damage);
            props.comboData.damageSummary = getDamageSummary(props.comboData.damage);
        } catch (error) {
            console.error('Failed to update damage', error);
        }
    };
    const updateScore = async (side) => {
        const revision = ++calculationRevision[side];
        const params = props.comboData.params[side].score;

        try {
            await loadDxAsset(params.shihai);
            if (revision !== calculationRevision[side]) {
                return;
            }
            const fix = side === 'reaction' && props.comboData.params.reaction.mode === '《イベイジョン》';
            props.comboData.score[side] = getScore(params,fix);
            props.comboData.scoreSummary = getScoreSummary(props.comboData.score);
            await updateDamage();
        } catch (error) {
            console.error(`Failed to update ${side} score`, error);
        }
    };
    watch(props.comboData.params.action.score, () => {
        void updateScore('action');
    });
    watch(props.comboData.params.reaction.score, () => {
        void updateScore('reaction');
    });
    watch(props.comboData.params.action.damage, () => {
        void updateDamage();
    });
    watch(props.comboData.params.reaction.damage, () => {
        void updateDamage();
    });

</script>

<template>
    <AttackForm :params="comboData.params.action" :comboColor="comboColor" :showDetails="showDetails.action"/>
    <DefenceForm :params="comboData.params.reaction" :comboColor="comboColor" :showDetails="showDetails.reaction"/>
</template>
