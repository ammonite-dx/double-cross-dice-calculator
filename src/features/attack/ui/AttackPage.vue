<script setup>
    import { inject } from 'vue'
    import {
        CALCULATION_CLIENT_KEY,
        calculationClient as defaultCalculationClient,
    } from '../../../application/CalculationClient'
    import { useAttack } from '../model/useAttack'
    import InputPanel from '../../../components/Attack/InputPanel.vue'
    import ScoreChartPanel from '../../../components/Attack/ScoreChartPanel.vue'
    import DamageChartPanel from '../../../components/Attack/DamageChartPanel.vue'
    import SummaryPanel from '../../../components/Attack/SummaryPanel.vue'
    import RangePlanNotice from '../../../components/RangePlanNotice.vue'

    const calculationClient = inject(
        CALCULATION_CLIENT_KEY,
        defaultCalculationClient
    )
    const {
        attackData,
        displayRequest,
        scoreDisplayRequest,
        canonicalDisplayPresentation,
        canonicalScoreDisplayPresentation,
        canonicalSummaryReady,
        canonicalFeedbackNotice,
        onDisplayValidated,
        onScoreDisplayValidated,
    } = useAttack({ calculationClient })
</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel :attackData="attackData" /></v-col></v-row>
        <v-row><v-col cols="12"><RangePlanNotice :feedback="canonicalFeedbackNotice" /></v-col></v-row>
        <v-row>
            <v-col md="6" cols="12">
                <ScoreChartPanel
                    :attackData="attackData"
                    :displayRequest="scoreDisplayRequest"
                    :presentation="canonicalScoreDisplayPresentation"
                    :displayFeedback="attackData.canonicalScoreDisplayFeedback"
                    @display-validated="onScoreDisplayValidated"
                />
            </v-col>
            <v-col md="6" cols="12">
                <DamageChartPanel
                    :attackData="attackData"
                    :displayRequest="displayRequest"
                    :presentation="canonicalDisplayPresentation"
                    :displayFeedback="attackData.canonicalDisplayFeedback"
                    @display-validated="onDisplayValidated"
                />
            </v-col>
        </v-row>
        <v-row v-if="canonicalSummaryReady"><v-col cols="12">
            <SummaryPanel
                :attackData="attackData"
                :presentation="canonicalDisplayPresentation"
                :scorePresentation="canonicalScoreDisplayPresentation"
            />
        </v-col></v-row>
    </v-container>
</template>

