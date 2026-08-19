<script setup>

    import { computed } from 'vue';
    import { useDisplay } from 'vuetify'
    import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
    import { Line } from 'vue-chartjs';
    import annotationPlugin from 'chartjs-plugin-annotation';
    import {
        CHECK_CANONICAL_PRESENTATION_MODES,
        createCheckCanonicalPresentation,
    } from '@/application/CheckCanonicalPresentation';
    import { getCheckChartOptions,getCheckChartStyle } from './ChartSetter';

    Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, annotationPlugin);

    const props = defineProps(['checkData','setting']);
    const { mdAndUp } = useDisplay()
    const modeBySetting = Object.freeze({
        '達成値がXとなる確率を表示': CHECK_CANONICAL_PRESENTATION_MODES.PMF,
        '達成値がX以上となる確率を表示': CHECK_CANONICAL_PRESENTATION_MODES.UPPER_TAIL,
    });
    function getCanonicalChartMode(settingMode) {
        if (!Object.prototype.hasOwnProperty.call(modeBySetting, settingMode)) {
            throw new Error(`Unsupported Check chart mode: ${String(settingMode)}`);
        }
        return modeBySetting[settingMode];
    }
    const presentation = computed(() => {
        if (!props.checkData.resultReady || props.checkData.score === null) {
            return null;
        }
        return createCheckCanonicalPresentation(
            {score: props.checkData.score},
            {
                displayWindow: {
                    min: props.setting.min,
                    max: props.setting.max,
                },
                mode: getCanonicalChartMode(props.setting.mode),
                opposed: props.checkData.dfclty.opposed,
            }
        );
    });
    const data = computed(() => presentation.value?.status === 'ready'
        ? presentation.value.chart
        : null);
    const options = computed(() => getCheckChartOptions(props.checkData.dfclty));
    const style = computed(() => getCheckChartStyle(mdAndUp.value));

</script>

<template>
    <div>
        <Line v-if="data !== null" :data="data" :options="options" :style="style"/>
    </div>
</template>
