<script setup>

    import {
        formatScoreStatisticsExpectedValue,
        formatCertifiedProbabilityPercentDisplay,
    } from '@/shared/presentation';

    const props = defineProps({
        difficulty: {
            type: Object,
            required: true,
        },
        scoreStatistics: {
            type: Object,
            default: null,
        },
    });

    function getSideSummary(side) {
        return props.scoreStatistics?.[side] ?? null;
    }

    function getExpectedValue(side) {
        return formatScoreStatisticsExpectedValue(
            getSideSummary(side)?.expectedValue
        );
    }

    function getSuccessRate(side) {
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
