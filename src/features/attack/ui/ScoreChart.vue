<script setup>
    import { computed } from 'vue';
    import ProbabilityLineChart from '@/shared/chart/ProbabilityLineChart.vue';
    import {
        getAttackScoreChartData,
        getAttackScoreChartOptions,
    } from './ChartSetter';

    const props = defineProps({
        combos: {
            type: Array,
            required: true,
        },
        presentation: {
            type: Object,
            default: null,
        },
    });
    const data = computed(() => getAttackScoreChartData(
        props.presentation,
        props.combos
    ));
    const project = (maxRenderedPoints) => getAttackScoreChartData(
        props.presentation,
        props.combos,
        { maxRenderedPoints },
    );
    const options = computed(() => getAttackScoreChartOptions({
        mode: props.presentation?.mode,
    }));

</script>

<template>
    <ProbabilityLineChart
        :data="data"
        :options="options"
        :project="project"
        accessibleName="コンボ別 達成値確率分布"
    />
</template>
