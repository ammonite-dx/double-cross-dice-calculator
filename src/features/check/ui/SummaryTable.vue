<script setup lang="ts">

    import {
        formatScoreStatisticsExpectedValue,
        formatCertifiedProbabilityPercentDisplay,
    } from '@/shared/presentation';
    import type { DifficultyInput } from '@/domain/CalculationInputs'
    import type { ScoreStatistics } from '@/domain/ScoreResultTypes'

    const props = defineProps<{
        difficulty: DifficultyInput
        scoreStatistics: ScoreStatistics | null
    }>()

    function getSideSummary(side: 'action' | 'reaction') {
        return props.scoreStatistics?.[side] ?? null;
    }

    function getExpectedValue(side: 'action' | 'reaction') {
        return formatScoreStatisticsExpectedValue(
            getSideSummary(side)?.expectedValue
        );
    }

    function getSuccessRate(side: 'action' | 'reaction') {
        return formatCertifiedProbabilityPercentDisplay(
            getSideSummary(side)?.successProbability
        );
    }

</script>

<template>
    <v-table>
        <thead>
            <tr>
                <th class="pa-0" style="font-size:80%"></th>
                <th class="text-right pa-0" style="font-size:80%">達成値期待値</th>
                <th class="text-right pa-0" style="font-size:80%">成功率</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td class="pa-0" style="font-size:80%">アクション側</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ getExpectedValue('action') }}</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ getSuccessRate('action') }}</td>
            </tr>
            <tr v-if="props.difficulty.opposed">
                <td class="pa-0" style="font-size:80%">リアクション側</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ getExpectedValue('reaction') }}</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ getSuccessRate('reaction') }}</td>
            </tr>
        </tbody>
    </v-table>
</template>
