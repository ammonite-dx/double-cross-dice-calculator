<script setup>

    import {
        findCanonicalComboPresentation,
        formatCanonicalSummaryExpectedValue,
    } from './SummaryTable';

    const props = defineProps({
        attackData: {
            type: Object,
            required: true,
        },
        presentation: {
            type: Object,
            default: null,
        },
        canonicalOptIn: {
            type: Boolean,
            default: false,
        },
    });

    function getComboDamageExpectedValue(combo) {
        if (!props.canonicalOptIn) {
            return combo?.data?.damageSummary?.expectedValue ?? '—';
        }
        if (props.presentation?.status !== 'ready') {
            return formatCanonicalSummaryExpectedValue(null);
        }
        const display = findCanonicalComboPresentation(
            props.presentation,
            combo?.id
        );
        return formatCanonicalSummaryExpectedValue(
            display?.display?.expectedValue
        );
    }

    function getTotalDamageExpectedValue() {
        if (!props.canonicalOptIn) {
            return props.attackData.totalDamageSummary?.expectedValue ?? '—';
        }
        if (props.presentation?.status !== 'ready') {
            return formatCanonicalSummaryExpectedValue(null);
        }
        return formatCanonicalSummaryExpectedValue(
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
            <tr v-for="combo in props.attackData.combos" :key="combo.id">
                <td class="pa-0" style="font-size:80%">{{ combo.name }}</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ combo.data.scoreSummary?.action?.expectedValue ?? '—' }}</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ combo.data.scoreSummary?.action?.successRate ?? '—' }}%</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ getComboDamageExpectedValue(combo) }}</td>
            </tr>
            <tr v-if="props.attackData.combos.length > 1 && (props.canonicalOptIn ? props.presentation?.status === 'ready' : props.attackData.totalDamageReady)">
                <td class="pa-0" style="font-size:80%">合計</td>
                <td class="pa-0 text-right" style="font-size:80%"></td>
                <td class="pa-0 text-right" style="font-size:80%"></td>
                <td class="pa-0 text-right" style="font-size:80%">{{ getTotalDamageExpectedValue() }}</td>
            </tr>
        </tbody>
    </v-table>
</template>
