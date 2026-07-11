<script setup>
    import { computed } from 'vue';
    import { useDisplay } from 'vuetify';
    import { Chart, ArcElement, Tooltip, Legend, Title } from 'chart.js';
    import { Doughnut } from 'vue-chartjs';
    import ChartDataLabels from 'chartjs-plugin-datalabels';

    // 共通ユーティリティをインポート
    import { BACKTRACK_COLORS, getChartContainerStyle, getBaseChartOptions } from '@/utils/chart';

    // Chart.js のプラグイン登録
    Chart.register(ArcElement, Tooltip, Legend, Title, ChartDataLabels);

    const props = defineProps(['finalEncroachment', 'mode']);
    const { mdAndUp, smAndUp } = useDisplay();

    /**
     * データセット生成ロジック
     * モードに応じてラベルと色分けを切り替える
     */
    const chartData = computed(() => {
        const encroachment = props.finalEncroachment;
        let data, labels, backgroundColor;

        if (props.mode === 'single') {
            // 通常 (1倍振り)
            data = encroachment.single;
            labels = ["100%〜", "71〜99%", "51〜70%", "31〜50%", "0〜30%"];
            backgroundColor = [BACKTRACK_COLORS.failure, BACKTRACK_COLORS.success_danger, BACKTRACK_COLORS.success_warning, BACKTRACK_COLORS.success_caution, BACKTRACK_COLORS.success_safe];
        } else if (props.mode === 'undead') {
            // 不死者・悪夢 (特殊な境界値を持つ1倍振り)
            data = encroachment.single; 
            labels = ["120%～", "100〜119%", "71〜99%", "51〜70%", "31〜50%", "0〜30%"];
            backgroundColor = [BACKTRACK_COLORS.failure, BACKTRACK_COLORS.success_critical, BACKTRACK_COLORS.success_danger, BACKTRACK_COLORS.success_warning, BACKTRACK_COLORS.success_caution, BACKTRACK_COLORS.success_safe];
        } else {
            // 2倍振り・追加振り (失敗 or 成功のみ)
            data = props.mode === 'double' ? encroachment.double : encroachment.second;
            labels = ["失敗", "成功"];
            backgroundColor = [BACKTRACK_COLORS.failure, BACKTRACK_COLORS.success_safe];
        }

        return {
            labels,
            datasets: [{data, backgroundColor}]
        };
    });

    /**
     * オプション生成ロジック
     * 共通オプションをベースに、タイトルやデータラベル設定を上書き
     */
    const chartOptions = computed(() => {
        const base = getBaseChartOptions();
        
        // グラフタイトルの決定
        const titleText = () => {
            switch (props.mode) {
                case 'single':
                case 'undead':
                    return '一倍振り';
                case 'double':
                    return '二倍振り';
                case 'second':
                    return '二倍振り+追加振り';
            }
        };

        return {
            ...base,
            plugins: {
                ...base.plugins,
                title: {
                    display: true,
                    text: titleText,
                },
                datalabels: {
                    color: 'white',
                    textAlign: 'center',
                    font: {
                        size: smAndUp.value ? 12 : 6,
                        weight: 'bold',
                    },
                    // 10%以上の場合のみ、ラベルと数値を表示
                    formatter: (value, context) => {
                        if (value >= 10) {
                            const label = context.chart.data.labels[context.dataIndex];
                            return `${label}\n${value}%`;
                        }
                        return '';
                    }
                },
                // ツールチップ設定の微調整
                tooltip: {
                    callbacks: {
                        label: (item) => `${item.label}: ${item.formattedValue}%`
                    }
                }
            }
        };
    });

    /**
     * スタイル設定
     * 共通ユーティリティを使ってレスポンシブな高さを適用
     */
    const chartStyle = computed(() => 
        getChartContainerStyle(mdAndUp.value, '300px', '200px')
    );

</script>

<template>
    <div :style="chartStyle">
        <Doughnut :data="chartData" :options="chartOptions" />
    </div>
</template>