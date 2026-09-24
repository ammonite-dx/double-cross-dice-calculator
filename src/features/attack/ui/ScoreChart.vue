<script setup lang="ts">
    import { computed } from 'vue';
    import ProbabilityLineChart from '@/shared/chart/ProbabilityLineChart.vue';
    import {
        getAttackScoreChartData,
        getAttackScoreChartOptions,
    } from './AttackChartAdapter';
    import type { AttackUiCombo } from '../model/AttackControllerTypes'
    import type {
        AttackDisplayPresentation,
        AttackScoreDisplayPresentation,
    } from '../model/AttackPresentationTypes'

    const props = defineProps<{
        combos: readonly AttackUiCombo[]
        presentation: AttackDisplayPresentation | AttackScoreDisplayPresentation | null
        preservePreviousFrame: boolean
    }>()
    const data = computed(() => getAttackScoreChartData(
        props.presentation,
        props.combos
    ));
    const options = computed(() => getAttackScoreChartOptions({
        mode: props.presentation?.mode,
    }));

</script>

<template>
    <ProbabilityLineChart
        :data="data"
        :options="options"
        :preserve-previous-frame="props.preservePreviousFrame"
        dataset-id-key="datasetKey"
        accessibleName="攻撃判定 達成値確率分布"
    />
</template>
