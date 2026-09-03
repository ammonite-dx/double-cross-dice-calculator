<script setup>
    import { computed } from 'vue';
    import ProbabilityLineChart from '@/shared/chart/ProbabilityLineChart.vue';
    import {
        getCanonicalAttackDamageChartData,
        getAttackDamageChartOptions,
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
    const data = computed(() => getCanonicalAttackDamageChartData(
        props.presentation,
        props.combos
    ));
    const options = computed(() => getAttackDamageChartOptions());

</script>

<template>
    <ProbabilityLineChart :data="data" :options="options" />
</template>

