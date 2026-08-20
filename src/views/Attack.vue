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
        createAttackCanonicalDisplayFeedback,
    } from '@/application/AttackCanonicalDisplayFeedback';
    import {
        clearCanonicalAttackState,
        createCanonicalAttackState,
        createCanonicalComboDataState,
        ensureCanonicalComboData,
    } from '@/application/AttackCanonicalState';
    import {
        DEFAULT_ATTACK_DISPLAY_REQUEST,
        createAttackRangePolicy,
        createAttackDisplayRequestSnapshot,
    } from '@/application/AttackDisplayRequestSnapshot';
    import {
        createAttackCanonicalDisplayPresentation,
        createAttackCanonicalDisplayPresentationFromCanonical,
    } from '@/application/AttackCanonicalPresentation';
    import {
        DEFAULT_DISPLAY_RANGE_PLANNER_POLICY,
        planDisplayWindowResources,
    } from '@/presentation';
    import InputPanel from '@/components/Attack/InputPanel.vue';
    import ScoreChartPanel from '@/components/Attack/ScoreChartPanel.vue';
    import DamageChartPanel from '@/components/Attack/DamageChartPanel.vue';
    import SummaryPanel from '@/components/Attack/SummaryPanel.vue';
    import CanonicalAttackPanel from '@/components/Attack/CanonicalAttackPanel.vue';

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
    const displayRangePolicy = DEFAULT_DISPLAY_RANGE_PLANNER_POLICY;
    const displayRequest = reactive({
        ...createAttackDisplayRequestSnapshot(DEFAULT_ATTACK_DISPLAY_REQUEST),
    });
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

    function createCanonicalDisplaySource(state) {
        return {
            combos: state.combos.map((combo) => ({
                id: combo.id,
                canonicalDamagePresentation:
                    combo.data.canonicalDamagePresentation,
                canonicalRangePlan: combo.data.canonicalRangePlan,
            })),
            canonicalTotalDamagePresentation:
                state.canonicalTotalDamagePresentation,
        };
    }

    function publishCanonicalDisplayFeedback(presentation) {
        Object.assign(
            attackData.canonicalDisplayFeedback,
            createAttackCanonicalDisplayFeedback(presentation)
        );
    }

    const canonicalCalculationRunner = createAttackCanonicalRunner({
        state: attackData,
        calculationClient: canonicalCalculationClient,
        createPresentation: (batchResult, rangePlans, request) =>
            createAttackCanonicalDisplayPresentation(batchResult, {
                displayRequest: request ?? createAttackDisplayRequestSnapshot(displayRequest),
                rangePlans,
                policy: displayRangePolicy,
            }),
        createDisplayPresentation: ({ state, displayRequest: request }) =>
            createAttackCanonicalDisplayPresentationFromCanonical(
                createCanonicalDisplaySource(state),
                {
                    displayRequest: request ?? createAttackDisplayRequestSnapshot(displayRequest),
                    policy: displayRangePolicy,
                }
            ),
        onPresentation: publishCanonicalDisplayFeedback,
        onDisplayRejected: publishCanonicalDisplayFeedback,
        onError: (error) => {
            attackData.canonicalDisplayPresentation = null;
            attackData.canonicalDisplayFeedback.status = 'error';
            attackData.canonicalDisplayFeedback.plan = null;
            attackData.canonicalDisplayFeedback.error = error;
            console.error('Failed to update canonical attack', error);
        },
    });

    function publishCanonicalDisplayResourceRejection(plan) {
        attackData.canonicalDisplayPresentation = null;
        attackData.canonicalDisplayFeedback.status = 'rejected';
        attackData.canonicalDisplayFeedback.plan = plan;
        attackData.canonicalDisplayFeedback.error = null;
    }

    function publishCanonicalDisplayError(error) {
        attackData.canonicalDisplayPresentation = null;
        attackData.canonicalDisplayFeedback.status = 'error';
        attackData.canonicalDisplayFeedback.plan = null;
        attackData.canonicalDisplayFeedback.error = error;
    }

    function preflightCanonicalDisplay(request) {
        try {
            const plan = planDisplayWindowResources(
                { min: request.min, max: request.max },
                displayRangePolicy
            );
            if (!plan.accepted) {
                canonicalCalculationRunner.invalidate();
                clearCanonicalAttackState(attackData);
                publishCanonicalDisplayResourceRejection(plan);
                return false;
            }
            return true;
        } catch (error) {
            canonicalCalculationRunner.invalidate();
            clearCanonicalAttackState(attackData);
            publishCanonicalDisplayError(error);
            return false;
        }
    }

    function runCanonicalCalculation(request = displayRequest) {
        const snapshot = createAttackDisplayRequestSnapshot(request);
        if (!preflightCanonicalDisplay(snapshot)) {
            return Promise.resolve(false);
        }
        return canonicalCalculationRunner.run({
            displayRequest: snapshot,
            rangePolicy: createAttackRangePolicy(snapshot),
        });
    }

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
                if (displayRequest.max > 999 || displayRequest.min > 999) {
                    displayRequest.min = Math.min(displayRequest.min, 999);
                    displayRequest.max = Math.min(
                        Math.max(displayRequest.max, displayRequest.min),
                        999
                    );
                }
                return;
            }

            void runCanonicalCalculation();
        },
        { deep: true, immediate: true }
    );

    onUnmounted(() => {
        canonicalCalculationRunner.dispose();
        clearCanonicalAttackState(attackData);
    });

    const resultsReady = computed(() =>
        areAllComboResultsReady(attackData.combos)
        && attackData.totalDamageReady
    );

    const canonicalDisplayPresentation = computed(() =>
        attackData.canonicalOptIn === true
            ? attackData.canonicalDisplayPresentation
            : null
    );

    const canonicalSummaryReady = computed(() =>
        attackData.canonicalOptIn === true
        && attackData.canonicalDisplayPresentation?.status === 'ready'
    );

    function onDisplayValidated(request) {
        const snapshot = createAttackDisplayRequestSnapshot(request);
        displayRequest.min = snapshot.min;
        displayRequest.max = snapshot.max;
        displayRequest.mode = snapshot.mode;

        if (attackData.canonicalOptIn !== true) {
            return;
        }

        if (!preflightCanonicalDisplay(snapshot)) {
            return;
        }

        if (attackData.canonicalTotalDamageReady !== true) {
            void runCanonicalCalculation(snapshot);
            return;
        }

        try {
            const refreshed = canonicalCalculationRunner.refreshPresentation({
                displayRequest: snapshot,
                calculationOptions: {
                    rangePolicy: createAttackRangePolicy(snapshot),
                },
            });
            if (!refreshed) {
                attackData.canonicalDisplayPresentation = null;
            }
        } catch (error) {
            publishCanonicalDisplayError(error);
        }
    }

</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel :attackData="attackData"/></v-col></v-row>
        <v-row><v-col cols="12"><CanonicalAttackPanel :attackData="attackData" /></v-col></v-row>
        <v-row>
            <v-col v-if="resultsReady" md="6" cols="12"><ScoreChartPanel :attackData="attackData"/></v-col>
            <v-col v-if="resultsReady || attackData.canonicalOptIn" md="6" cols="12">
                <DamageChartPanel
                    :attackData="attackData"
                    :displayRequest="displayRequest"
                    :presentation="canonicalDisplayPresentation"
                    :canonicalOptIn="attackData.canonicalOptIn"
                    :displayFeedback="attackData.canonicalDisplayFeedback"
                    @display-validated="onDisplayValidated"
                />
            </v-col>
        </v-row>
        <v-row v-if="attackData.canonicalOptIn ? canonicalSummaryReady : resultsReady"><v-col cols="12">
            <SummaryPanel
                :attackData="attackData"
                :presentation="canonicalDisplayPresentation"
                :canonicalOptIn="attackData.canonicalOptIn"
            />
        </v-col></v-row>
    </v-container>
</template>
