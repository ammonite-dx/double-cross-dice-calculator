<script setup>

    import { computed } from 'vue';
    import { useDisplay } from 'vuetify'
    import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
    import { Line } from 'vue-chartjs';
    import annotationPlugin from 'chartjs-plugin-annotation';
    import { getCheckChartData,getCheckChartOptions,getCheckChartStyle } from './ChartSetter';

    Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, annotationPlugin);

    const props = defineProps(['checkData','setting']);
    const { mdAndUp } = useDisplay()
    const data = computed(() => getCheckChartData(props.checkData,props.setting));
    const options = computed(() => getCheckChartOptions(props.checkData.dfclty));
    const style = computed(() => getCheckChartStyle(mdAndUp.value));

</script>

<template>
    <div>
        <Line :data="data" :options="options" :style="style"/>
    </div>
</template>