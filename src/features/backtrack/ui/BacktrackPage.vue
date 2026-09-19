<script setup lang="ts">
    import { useCalculationClient } from '@/plugins/calculationClient'
    import { useBacktrack } from '../model/useBacktrack'
    import InputPanel from './InputPanel.vue'
    import FinalEncroachmentChartPanel from './FinalEncroachmentChartPanel.vue'

    const calculationClient = useCalculationClient()
    const {
        params,
        finalEncroachment,
        resultReady,
        rangeFeedback,
        onValidated,
    } = useBacktrack({ calculationClient })
</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel
            :params="params"
            :rangeFeedback="rangeFeedback"
            @validated="onValidated"
        /></v-col></v-row>
        <v-row v-if="resultReady"><v-col cols="12"><FinalEncroachmentChartPanel
            :dlois="params.dlois ?? 'なし'"
            :finalEncroachment="finalEncroachment ?? { single: [], double: [], second: [] }"
        /></v-col></v-row>
    </v-container>
</template>
