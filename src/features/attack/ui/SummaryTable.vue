<script setup>

    import {
        findComboPresentation,
        formatSummaryExpectedValue,
        formatScoreSuccessRateDisplay,
        formatScoreSummaryExpectedValue,
        getScoreSummaryForCombo,
    } from './SummaryTable';

    const props = defineProps({
        combos: {
            type: Array,
            required: true,
        },
        presentation: {
            type: Object,
            default: null,
        },
        scorePresentation: {
            type: Object,
            default: null,
        },
    });

    function getComboDamageExpectedValue(combo) {
        if (props.presentation?.status !== 'ready') {
            return formatSummaryExpectedValue(null);
        }
        const display = findComboPresentation(
            props.presentation,
            combo?.id
        );
        return formatSummaryExpectedValue(
            display?.display?.expectedValue
        );
    }

    function getComboScoreExpectedValue(combo) {
        const summary = getScoreSummaryForCombo(
            props.scorePresentation,
            combo?.id
        );
        return formatScoreSummaryExpectedValue(
            summary?.action?.expectedValue
        );
    }

    function getComboScoreSuccessRate(combo) {
        const summary = getScoreSummaryForCombo(
            props.scorePresentation,
            combo?.id
        );
        return formatScoreSuccessRateDisplay(
            summary?.action?.successRate
        );
    }

    function getTotalDamageExpectedValue() {
        if (props.presentation?.status !== 'ready') {
            return formatSummaryExpectedValue(null);
        }
        return formatSummaryExpectedValue(
            props.presentation?.total?.display?.expectedValue
        );
    }

</script>

<template>
    <v-table>
        <thead>
            <tr>
                <th class="pa-0" style="font-size:80%"></th>
                <th class="text-right pa-0" style="font-size:80%">達成値期待値</th>
                <th class="text-right pa-0" style="font-size:80%">命中率</th>
                <th class="text-right pa-0" style="font-size:80%">ダメージ期待値</th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="combo in props.combos" :key="combo.id">
                <td class="pa-0" style="font-size:80%">{{ combo.name }}</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ getComboScoreExpectedValue(combo) }}</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ getComboScoreSuccessRate(combo) }}</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ getComboDamageExpectedValue(combo) }}</td>
            </tr>
            <tr v-if="props.combos.length > 1 && props.presentation?.status === 'ready'">
                <td class="pa-0" style="font-size:80%">合計</td>
                <td class="pa-0 text-right" style="font-size:80%"></td>
                <td class="pa-0 text-right" style="font-size:80%"></td>
                <td class="pa-0 text-right" style="font-size:80%">{{ getTotalDamageExpectedValue() }}</td>
            </tr>
        </tbody>
    </v-table>
</template>
