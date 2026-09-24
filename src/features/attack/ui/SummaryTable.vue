<script setup lang="ts">

    import {
        findComboPresentation,
        formatSummaryExpectedValue,
        formatCertifiedProbabilityPercentDisplay,
        formatScoreStatisticsExpectedValue,
        getScoreStatisticsForCombo,
    } from './SummaryTableHelpers';
    import type { AttackUiCombo } from '../model/AttackControllerTypes'
    import type {
        AttackDisplayPresentation,
        AttackScoreDisplayPresentation,
    } from '../model/AttackPresentationTypes'

    const props = defineProps<{
        combos: readonly Pick<AttackUiCombo, 'id' | 'name'>[]
        presentation: AttackDisplayPresentation | null
        scorePresentation: AttackScoreDisplayPresentation | null
    }>()

    function getComboDamageExpectedValue(combo: Pick<AttackUiCombo, 'id' | 'name'>) {
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

    function getComboScoreExpectedValue(combo: Pick<AttackUiCombo, 'id' | 'name'>) {
        const summary = getScoreStatisticsForCombo(
            props.scorePresentation,
            combo?.id
        );
        return formatScoreStatisticsExpectedValue(
            summary?.action?.expectedValue
        );
    }

    function getComboScoreSuccessRate(combo: Pick<AttackUiCombo, 'id' | 'name'>) {
        const summary = getScoreStatisticsForCombo(
            props.scorePresentation,
            combo?.id
        );
        return formatCertifiedProbabilityPercentDisplay(
            summary?.action?.successProbability
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
