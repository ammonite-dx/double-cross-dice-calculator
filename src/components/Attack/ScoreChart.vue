<script setup>

    import { computed } from 'vue';
    import ProbabilityLineChart from '@/shared/chart/ProbabilityLineChart.vue';
    import {
        getCanonicalAttackScoreChartData,
        getAttackScoreChartOptions,
    } from './ChartSetter';

    const props = defineProps({
        attackData: {
            type: Object,
            required: true,
        },
        displayRequest: {
            type: Object,
            required: true,
        },
        presentation: {
            type: Object,
            default: null,
        },
    });
    const data = computed(() => getCanonicalAttackScoreChartData(
        props.presentation,
        props.attackData
    ));
    const options = computed(() => getAttackScoreChartOptions(props.attackData.dfclty));

</script>

<template>
    <ProbabilityLineChart :data="data" :options="options" />
</template>
