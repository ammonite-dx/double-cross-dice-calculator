<script setup>

    import { watch } from 'vue';
    import { getDamage,getDamageSummary } from '@/data/Calculator';
    import { loadDxAsset } from '@/data/PrecomputedDataRepository';
    import { getScore,getScoreSummary } from '@/data/ScoreCalculator';
    import AttackForm from './AttackForm.vue';
    import DefenceForm from './DefenceForm.vue';

    const props = defineProps(['comboData','comboColor','showDetails']);
    const calculationRevision = {action: 0, reaction: 0};
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
            props.comboData.damage = getDamage(props.comboData.score, props.comboData.params.action.damage, props.comboData.params.reaction.damage);
            props.comboData.damageSummary = getDamageSummary(props.comboData.damage);
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
        props.comboData.damage = getDamage(props.comboData.score, props.comboData.params.action.damage, props.comboData.params.reaction.damage);
        props.comboData.damageSummary = getDamageSummary(props.comboData.damage);
    });
    watch(props.comboData.params.reaction.damage, () => {
        props.comboData.damage = getDamage(props.comboData.score, props.comboData.params.action.damage, props.comboData.params.reaction.damage);
        props.comboData.damageSummary = getDamageSummary(props.comboData.damage);
    });

</script>

<template>
    <AttackForm :params="comboData.params.action" :comboColor="comboColor" :showDetails="showDetails.action"/>
    <DefenceForm :params="comboData.params.reaction" :comboColor="comboColor" :showDetails="showDetails.reaction"/>
</template>
