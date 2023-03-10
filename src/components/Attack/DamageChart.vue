<script setup>

    import { computed } from 'vue';
    import { useDisplay } from 'vuetify'
    import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
    import { Line } from 'vue-chartjs';
    import annotationPlugin from 'chartjs-plugin-annotation';
    import { getAttackDamageChartData,getAttackDamageChartOptions,getAttackDamageChartStyle } from './ChartSetter';

    Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, annotationPlugin);

    const props = defineProps(['attackData','setting']);
    const { mdAndUp } = useDisplay()
    const data = computed(() => getAttackDamageChartData(props.attackData,props.setting));
    const options = computed(() => getAttackDamageChartOptions(props.attackData.dfclty));
    const style = computed(() => getAttackDamageChartStyle(mdAndUp.value));

</script>

<template>
    <div>
        <Line :data="data" :options="options" :style="style"/>
    </div>
</template>