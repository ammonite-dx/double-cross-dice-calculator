<script setup lang="ts">

    import { computed } from 'vue';
    import ProbabilityLineChart from '@/shared/chart/ProbabilityLineChart.vue';
    import { getCheckChartOptions } from './CheckChartConfig';
    import type { DifficultyInput } from '@/domain/CalculationInputs'
    import type { CheckPresentation } from '../model/CheckPresentationTypes'

    const props = defineProps<{
        difficulty: DifficultyInput
        presentation: CheckPresentation | null
        preservePreviousFrame: boolean
    }>()
    const data = computed(() => props.presentation?.status === 'ready'
        ? props.presentation.chart
        : null);
    const options = computed(() => getCheckChartOptions({
        ...props.difficulty,
        mode: props.presentation?.mode,
    }));

</script>

<template>
    <ProbabilityLineChart
        :data="data"
        :options="options"
        :preserve-previous-frame="props.preservePreviousFrame"
        accessibleName="一般判定 達成値確率分布"
    />
</template>
