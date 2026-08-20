<script setup>

    import { computed } from 'vue';
    import { useDisplay } from 'vuetify'
    import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
    import { Line } from 'vue-chartjs';
    import annotationPlugin from 'chartjs-plugin-annotation';
    import {
        getAttackDamageChartData,
        getCanonicalAttackDamageChartData,
        getAttackDamageChartOptions,
        getAttackDamageChartStyle,
    } from './ChartSetter';

    Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, annotationPlugin);

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
        canonicalOptIn: {
            type: Boolean,
            default: false,
        },
    });
    const { mdAndUp } = useDisplay()
    const data = computed(() => props.canonicalOptIn
        ? getCanonicalAttackDamageChartData(
            props.presentation,
            props.attackData
        )
        : getAttackDamageChartData(
            props.attackData,
            props.displayRequest
        ));
    const options = computed(() => getAttackDamageChartOptions(props.attackData.dfclty));
    const style = computed(() => getAttackDamageChartStyle(mdAndUp.value));

</script>

<template>
    <div>
        <Line v-if="data !== null" :data="data" :options="options" :style="style"/>
    </div>
</template>
