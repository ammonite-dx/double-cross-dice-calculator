<script setup>

    import { computed } from 'vue';
    import { useDisplay } from 'vuetify';
    import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
    import { Line } from 'vue-chartjs';
    import annotationPlugin from 'chartjs-plugin-annotation';
    import {
        getCanonicalAttackScoreChartData,
        getAttackScoreChartOptions,
        getAttackScoreChartStyle,
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
    });
    const { mdAndUp } = useDisplay();
    const data = computed(() => getCanonicalAttackScoreChartData(
        props.presentation,
        props.attackData
    ));
    const options = computed(() => getAttackScoreChartOptions(props.attackData.dfclty));
    const style = computed(() => getAttackScoreChartStyle(mdAndUp.value));

</script>

<template>
    <div>
        <Line v-if="data !== null" :data="data" :options="options" :style="style"/>
    </div>
</template>
