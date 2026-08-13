<script setup>

    import { computed, inject, onUnmounted, reactive, watch } from 'vue';
    import {
        CALCULATION_CLIENT_KEY,
        calculationClient,
    } from '@/application/CalculationClient';
    import {
        areAllComboResultsReady,
        createCalculationFeedbackState,
        createTotalDamageState,
        runInitialCalculation,
    } from '@/application/CalculationFeedback';
    import { createAttackCanonicalRunner } from '@/application/AttackCanonicalRunner';
    import {
        clearCanonicalAttackState,
        createCanonicalAttackState,
        createCanonicalComboDataState,
        ensureCanonicalComboData,
    } from '@/application/AttackCanonicalState';
    import InputPanel from '@/components/Attack/InputPanel.vue';
    import ScoreChartPanel from '@/components/Attack/ScoreChartPanel.vue';
    import DamageChartPanel from '@/components/Attack/DamageChartPanel.vue';
    import SummaryPanel from '@/components/Attack/SummaryPanel.vue';

    const initialParams = {
        action: {
            score: {dice:1, critical:10, skill:0, yousei:0, shihai:0},
            damage: {dice:0, value:0, kazanari:0},
        },
        reaction: {
            mode: 'ドッジ',
            score: {dice:1, critical:10, skill:0, yousei:0, shihai:0},
            damage: {dice:0, value:0},
        }
    };
    const canonicalCalculationClient = inject(
        CALCULATION_CLIENT_KEY,
        calculationClient
    );
    const rangeFeedback = createCalculationFeedbackState();
    const initialCalculation = await runInitialCalculation({
        feedback: rangeFeedback,
        calculate: (options) => calculationClient.calculateAttackCombo(
            initialParams,
            options
        ),
        onError: (error) => {
            console.error('Failed to initialize attack calculation', error);
        },
    });
    const attackData = reactive({
        combos: [{
            id: 0,
            name: 'コンボ1',
            show: true,
            showDetails: {
                action: {value:false},
                reaction: {value:false}
            },
            data: {
                params: initialParams,
                score: initialCalculation?.score ?? null,
                scoreSummary: initialCalculation?.scoreSummary ?? null,
                damage: initialCalculation?.damage ?? null,
                damageSummary: initialCalculation?.damageSummary ?? null,
                resultReady: initialCalculation !== null,
                rangeFeedback: reactive(rangeFeedback),
                ...createCanonicalComboDataState(),
            },
        }],
        ...createTotalDamageState(initialCalculation),
        totalDamageFeedback: reactive(createCalculationFeedbackState()),
        ...createCanonicalAttackState(),
        canonicalOptIn: false,
    });

    const canonicalCalculationRunner = createAttackCanonicalRunner({
        state: attackData,
        calculationClient: canonicalCalculationClient,
        onError: (error) => {
            console.error('Failed to update canonical attack', error);
        },
    });

    watch(
        () => ({
            canonicalOptIn: attackData.canonicalOptIn,
            combos: attackData.combos.map((combo) => ({
                id: combo.id,
                params: combo.data.params,
            })),
        }),
        (current, previous) => {
            for (const combo of attackData.combos) {
                ensureCanonicalComboData(combo.data);
            }

            if (!current.canonicalOptIn) {
                if (previous?.canonicalOptIn === true) {
                    canonicalCalculationRunner.invalidate();
                    clearCanonicalAttackState(attackData);
                }
                return;
            }

            void canonicalCalculationRunner.run();
        },
        { deep: true, immediate: true }
    );

    onUnmounted(() => {
        canonicalCalculationRunner.invalidate();
        clearCanonicalAttackState(attackData);
    });

    const resultsReady = computed(() =>
        areAllComboResultsReady(attackData.combos)
        && attackData.totalDamageReady
    );

</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel :attackData="attackData"/></v-col></v-row>
        <v-row>
            <v-col v-if="resultsReady" md="6" cols="12"><ScoreChartPanel :attackData="attackData"/></v-col>
            <v-col v-if="resultsReady" md="6" cols="12"><DamageChartPanel :attackData="attackData"/></v-col>
        </v-row>
        <v-row v-if="resultsReady"><v-col cols="12"><SummaryPanel :attackData="attackData"/></v-col></v-row>
    </v-container>
</template>
