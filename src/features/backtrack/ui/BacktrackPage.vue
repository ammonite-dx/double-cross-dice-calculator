<script setup>
    import { inject } from 'vue'
    import {
        CALCULATION_CLIENT_KEY,
        calculationClient as defaultCalculationClient,
    } from '@/application/CalculationClient'
    import { useBacktrack } from '../model/useBacktrack'
    import InputPanel from './InputPanel.vue'
    import FinalEncroachmentChartPanel from './FinalEncroachmentChartPanel.vue'

    const calculationClient = inject(
        CALCULATION_CLIENT_KEY,
        defaultCalculationClient
    )
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
            :dlois="params.dlois"
            :finalEncroachment="finalEncroachment"
        /></v-col></v-row>
    </v-container>
</template>
