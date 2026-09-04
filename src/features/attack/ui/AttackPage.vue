<script setup>
    import { inject } from 'vue'
    import {
        CALCULATION_CLIENT_KEY,
        calculationClient as defaultCalculationClient,
    } from '../../../runtime/CalculationClient'
    import { useAttack } from '../model/useAttack'
    import InputPanel from './InputPanel.vue'
    import ScoreChartPanel from './ScoreChartPanel.vue'
    import DamageChartPanel from './DamageChartPanel.vue'
    import SummaryPanel from './SummaryPanel.vue'
    import RangePlanNotice from '../../../components/RangePlanNotice.vue'

    const calculationClient = inject(
        CALCULATION_CLIENT_KEY,
        defaultCalculationClient
    )
    const {
        combos,
        displayRequest,
        scoreDisplayRequest,
        canonicalDisplayPresentation,
        canonicalScoreDisplayPresentation,
        canonicalDisplayFeedback,
        canonicalScoreDisplayFeedback,
        canonicalSummaryReady,
        canonicalFeedbackNotice,
        onDisplayValidated,
        onScoreDisplayValidated,
        addCombo,
        duplicateCombo,
        removeCombo,
        onComboNameChanged,
        onComboVisibilityChanged,
        onComboDetailsChanged,
        onComboSideValidated,
    } = useAttack({ calculationClient })
</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel
            :combos="combos"
            @combo-add="addCombo"
            @combo-duplicate="duplicateCombo"
            @combo-remove="removeCombo"
            @combo-name-changed="onComboNameChanged"
            @combo-visibility-changed="onComboVisibilityChanged"
            @combo-details-changed="onComboDetailsChanged"
            @combo-side-validated="onComboSideValidated"
        /></v-col></v-row>
        <v-row><v-col cols="12"><RangePlanNotice :feedback="canonicalFeedbackNotice" /></v-col></v-row>
        <v-row>
            <v-col md="6" cols="12">
                <ScoreChartPanel
                    :combos="combos"
                    :displayRequest="scoreDisplayRequest"
                    :presentation="canonicalScoreDisplayPresentation"
                    :displayFeedback="canonicalScoreDisplayFeedback"
                    @display-validated="onScoreDisplayValidated"
                />
            </v-col>
            <v-col md="6" cols="12">
                <DamageChartPanel
                    :combos="combos"
                    :displayRequest="displayRequest"
                    :presentation="canonicalDisplayPresentation"
                    :displayFeedback="canonicalDisplayFeedback"
                    @display-validated="onDisplayValidated"
                />
            </v-col>
        </v-row>
        <v-row v-if="canonicalSummaryReady"><v-col cols="12">
            <SummaryPanel
                :combos="combos"
                :presentation="canonicalDisplayPresentation"
                :scorePresentation="canonicalScoreDisplayPresentation"
            />
        </v-col></v-row>
    </v-container>
</template>
