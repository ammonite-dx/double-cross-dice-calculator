<script setup>
    import { computed } from 'vue';
    import { useDisplay } from 'vuetify';
    import { Chart, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Title, Filler } from 'chart.js';
    import { Line } from 'vue-chartjs';
    import annotationPlugin from 'chartjs-plugin-annotation';

    // 共通ユーティリティ
    import { CHART_COLORS, getChartContainerStyle, getBaseChartOptions, getLinearScales, clipData } from '@/utils/chart';

    Chart.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Title, Filler, annotationPlugin);

    const props = defineProps(['checkData']); // { params, dfclty, score, ... }
    const { mdAndUp } = useDisplay();

    // チャート設定用の定数 (スライダー等で可変にするならProps化が必要ですが、一旦固定で実装)
    const setting = { min: 0, max: 50, mode: 'upperTail' }; // mode: 'distribution' or 'upperTail'

    // ヘルパー: 範囲配列生成 (lodash.range の代わり)
    const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => start + i);

    /**
     * データセット生成
     */
    const chartData = computed(() => {
        const score = props.checkData.score;
        const opposed = props.checkData.dfclty.opposed;
        
        // 計算結果がまだない場合は空データを返す
        if (!score || !score.action) return { labels: [], datasets: [] };

        const labels = range(setting.min, setting.max);
        
        // 表示モードに応じたデータ選択
        const key = setting.mode === 'distribution' ? 'distribution' : 'upperTailProbability';
        
        const datasets = [
            {
                label: 'アクション側',
                data: clipData(score.action[key], setting.min, setting.max),
                borderColor: CHART_COLORS.primary,
                backgroundColor: CHART_COLORS.primary,
                pointRadius: 0,
                borderWidth: 2,
                fill: false
            }
        ];

        // 対決の場合、リアクション側を追加
        if (opposed && score.reaction) {
            datasets.push({
                label: 'リアクション側',
                data: clipData(score.reaction[key], setting.min, setting.max),
                borderColor: CHART_COLORS.secondary,
                backgroundColor: CHART_COLORS.secondary,
                pointRadius: 0,
                borderWidth: 2,
                fill: false
            });
        }

        return { labels, datasets };
    });

    /**
     * オプション生成
     */
    const chartOptions = computed(() => {
        const base = getBaseChartOptions();
        const scales = getLinearScales('達成値', '確率 [%]');
        const opposed = props.checkData.dfclty.opposed;
        const target = props.checkData.dfclty.target;

        // アノテーション（難易度の線）設定
        const annotations = {};
        if (!opposed && target !== undefined) {
            annotations.line1 = {
                type: 'line',
                scaleID: 'x',
                value: target,
                borderColor: CHART_COLORS.secondary,
                borderWidth: 2,
                label: {
                    display: true,
                    content: `難易度: ${target}`,
                    position: 'start',
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    color: 'white'
                }
            };
        }

        return {
            ...base,
            scales: scales,
            plugins: {
                ...base.plugins,
                legend: { display: true }, // 線グラフなので凡例あり
                annotation: { annotations }
            }
        };
    });

    const chartStyle = computed(() => 
        getChartContainerStyle(mdAndUp.value)
    );
</script>

<template>
    <div :style="chartStyle">
        <Line :data="chartData" :options="chartOptions" />
    </div>
</template>