<script setup>

    import { computed } from 'vue'
    import { useDisplay } from 'vuetify'
    import {
        CategoryScale,
        Chart,
        Legend,
        LinearScale,
        LineElement,
        PointElement,
        Title,
        Tooltip,
    } from 'chart.js'
    import annotationPlugin from 'chartjs-plugin-annotation'
    import { Line } from 'vue-chartjs'
    import { getProbabilityLineChartStyle } from './ProbabilityLineChartConfig'

    Chart.register(
        CategoryScale,
        LinearScale,
        PointElement,
        LineElement,
        Title,
        Tooltip,
        Legend,
        annotationPlugin,
    )

    const props = defineProps({
        data: {
            type: Object,
            default: null,
        },
        options: {
            type: Object,
            required: true,
        },
    })

    const { mdAndUp } = useDisplay()
    const style = computed(() => getProbabilityLineChartStyle(mdAndUp.value))

</script>

<template>
    <div>
        <Line v-if="props.data !== null" :data="props.data" :options="props.options" :style="style" />
    </div>
</template>
