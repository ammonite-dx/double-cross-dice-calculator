<script setup lang="ts">
    import { useCalculationClient } from '@/plugins/calculationClient'
    import { useAttack } from '../model/useAttack'
    import InputPanel from './InputPanel.vue'
    import ScoreChartPanel from './ScoreChartPanel.vue'
    import DamageChartPanel from './DamageChartPanel.vue'
    import SummaryPanel from './SummaryPanel.vue'
    import RangePlanNotice from '../../../components/RangePlanNotice.vue'
    import LayoutFootprintRow from '@/shared/layout/LayoutFootprintRow.vue'

    const calculationClient = useCalculationClient()
    const {
        combos,
        displayRequest,
        scoreDisplayRequest,
        displayPresentation,
        scoreDisplayPresentation,
        displayFeedback,
        scoreDisplayFeedback,
        summaryReady,
        scoreChartTransitionPending,
        damageChartTransitionPending,
        feedbackNotice,
        onDisplayValidated,
        onScoreDisplayValidated,
        addCombo,
        duplicateCombo,
        removeCombo,
        onComboNameChanged,
        onComboVisibilityChanged,
        onComboAdvancedSettingsChanged,
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
            @combo-advanced-settings-changed="onComboAdvancedSettingsChanged"
            @combo-side-validated="onComboSideValidated"
        /></v-col></v-row>
        <v-row><v-col cols="12"><RangePlanNotice :feedback="feedbackNotice" /></v-col></v-row>
        <v-row>
            <v-col md="6" cols="12">
                <ScoreChartPanel
                    :combos="combos"
                    :displayRequest="scoreDisplayRequest"
                    :presentation="scoreDisplayPresentation"
                    :displayFeedback="scoreDisplayFeedback"
                    :preserve-previous-frame="scoreChartTransitionPending"
                    @display-validated="onScoreDisplayValidated"
                />
            </v-col>
            <v-col md="6" cols="12">
                <DamageChartPanel
                    :combos="combos"
                    :displayRequest="displayRequest"
                    :presentation="displayPresentation"
                    :displayFeedback="displayFeedback"
                    :preserve-previous-frame="damageChartTransitionPending"
                    @display-validated="onDisplayValidated"
                />
            </v-col>
        </v-row>
        <LayoutFootprintRow
            :ready="summaryReady"
            :preserve-footprint="scoreChartTransitionPending || damageChartTransitionPending"
        >
            <v-col v-if="summaryReady" cols="12">
                <SummaryPanel
                    :combos="combos"
                    :presentation="displayPresentation"
                    :scorePresentation="scoreDisplayPresentation"
                />
            </v-col>
        </LayoutFootprintRow>
    </v-container>
</template>
