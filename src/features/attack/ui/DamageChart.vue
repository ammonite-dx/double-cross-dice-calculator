<script setup>
    import { computed } from 'vue';
    import ProbabilityLineChart from '@/shared/chart/ProbabilityLineChart.vue';
    import {
        getAttackDamageChartData,
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
        accessibleName="コンボ別 ダメージ確率分布"
    />
</template>
