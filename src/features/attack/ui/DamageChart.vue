<script setup lang="ts">
    import { computed } from 'vue';
    import ProbabilityLineChart from '@/shared/chart/ProbabilityLineChart.vue';
    import {
        getAttackDamageChartData,
        getAttackDamageChartOptions,
    } from './AttackChartAdapter';
    import type { AttackUiCombo } from '../model/AttackControllerTypes'
    import type { AttackDisplayPresentation } from '../model/AttackPresentationTypes'

    const props = defineProps<{
        combos: readonly AttackUiCombo[]
        presentation: AttackDisplayPresentation | null
        preservePreviousFrame: boolean
    }>()
    const data = computed(() => getAttackDamageChartData(
        props.presentation,
        props.combos
    ));
    const options = computed(() => getAttackDamageChartOptions({
        mode: props.presentation?.mode,
    }));

</script>

<template>
    <ProbabilityLineChart
        :data="data"
        :options="options"
        :preserve-previous-frame="props.preservePreviousFrame"
        dataset-id-key="datasetKey"
        accessibleName="攻撃判定 ダメージ確率分布"
    />
</template>
