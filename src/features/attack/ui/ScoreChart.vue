<script setup>
    import { computed } from 'vue';
    import ProbabilityLineChart from '@/shared/chart/ProbabilityLineChart.vue';
    import {
        getCanonicalAttackScoreChartData,
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
    const data = computed(() => getCanonicalAttackScoreChartData(
        props.presentation,
        props.combos
    ));
    const options = computed(() => getAttackScoreChartOptions());

</script>

<template>
    <ProbabilityLineChart :data="data" :options="options" />
</template>

