<script setup>
    import { reactive } from 'vue';
    import { useCheckCalculation } from '@/composables/useCheckCalculation';
    
    // UI
    import AppCard from '@/components/common/AppCard.vue';
    import { mdiTuneVariant, mdiChartLine, mdiTable } from '@mdi/js';
    import CheckForm from '@/components/Check/CheckForm.vue';
    import ScoreChart from '@/components/Check/ScoreChart.vue';
    import SummaryTable from '@/components/Check/SummaryTable.vue'; // 既存コンポーネントを流用想定

    // 1. 初期データ
    const initialParams = {
        action: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 }, // 初期値は適当なデフォルト
        reaction: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
    };
    const initialDfclty = {
        opposed: false,
        target: 0
    };

    // 2. リアクティブ化
    const params = reactive(initialParams);
    const dfclty = reactive(initialDfclty);

    // 3. 計算ロジック
    const { score, scoreSummary } = useCheckCalculation(params, dfclty);

    // 4. データ統合 (子コンポーネント互換用)
    const checkData = reactive({
        params,
        dfclty,
        score,
        scoreSummary // SummaryTableなどがこれを使う想定
    });
</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row>
            <v-col cols="12">
                <AppCard title="判定条件" :icon="mdiTuneVariant">
                    <CheckForm :params="params" :dfclty="dfclty" />
                </AppCard>
            </v-col>
        </v-row>

        <v-row>
            <v-col cols="12">
                <AppCard title="達成値分布" :icon="mdiChartLine">
                    <ScoreChart :checkData="checkData" />
                </AppCard>
            </v-col>
        </v-row>
            
        <v-row>
            <v-col cols="12">
                <AppCard title="判定結果" :icon="mdiTable">
                    <SummaryTable :checkData="checkData" />
                </AppCard>
            </v-col>
        </v-row>
    </v-container>
</template>