<script setup>
    import { reactive } from 'vue';
    import { useBacktrackCalculation } from '@/composables/useBacktrackCalculation';
    
    // 共通UI & アイコン
    import AppCard from '@/components/common/AppCard.vue';
    import { mdiTuneVariant, mdiChartLine } from '@mdi/js';

    // 機能コンポーネント
    import BacktrackForm from '@/components/Backtrack/BacktrackForm.vue';
    import FinalEncroachmentChart from '@/components/Backtrack/FinalEncroachmentChart.vue';

    // 1. 初期データ
    const initialParams = {
        encroachment: 100,
        lois: 7,
        elois: 0,
        dice: 0,
        value: 0,
        dlois: 'なし',
    };

    // 2. リアクティブ化
    const params = reactive(initialParams);

    // 3. 計算ロジック呼び出し
    const { finalEncroachment } = useBacktrackCalculation(params);

</script>

<template>
    <v-container fluid class="pa-6">
        <v-row>
            <v-col cols="12">
                <AppCard title="バックトラック条件" :icon="mdiTuneVariant">
                    <BacktrackForm :params="params"/>
                </AppCard>
            </v-col>
        </v-row>

        <v-row>
            <v-col cols="12">
                <AppCard title="最終侵蝕率分布" :icon="mdiChartLine">
                    <v-row class="ma-0">
                        <v-col v-if="params.dlois === '不死者・悪夢'" md="4" cols="6" class="px-1 py-2"><FinalEncroachmentChart :finalEncroachment="finalEncroachment" mode="undead"/></v-col>
                        <v-col v-else md="4" cols="6" class="px-1 py-2"><FinalEncroachmentChart :finalEncroachment="finalEncroachment" mode="single"/></v-col>
                        <v-col md="4" cols="6" class="pa-1 py-2"><FinalEncroachmentChart :finalEncroachment="finalEncroachment" mode="double"/></v-col>
                        <v-col md="4" cols="6" class="pa-1 py-2"><FinalEncroachmentChart :finalEncroachment="finalEncroachment" mode="second"/></v-col>
                    </v-row>
                </AppCard>
            </v-col>
        </v-row>
    </v-container>
</template>