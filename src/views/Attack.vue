<script setup>

    import { computed, inject, onMounted, onUnmounted, reactive, watch } from 'vue';
    import {
        CALCULATION_CLIENT_KEY,
        calculationClient,
    } from '@/application/CalculationClient';
    import { createAttackCanonicalRunner } from '@/application/AttackCanonicalRunner';
    import {
        createAttackCanonicalDisplayFeedback,
        createAttackCanonicalScoreDisplayFeedback,
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
    import RangePlanNotice from '@/components/RangePlanNotice.vue';

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
    const scoreDisplayRequest = reactive({
        ...createAttackDisplayRequestSnapshot(DEFAULT_ATTACK_DISPLAY_REQUEST),
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
                ...createCanonicalComboDataState(),
            },
        }],
        ...createCanonicalAttackState(),
    });

    function createCanonicalDisplaySource(state) {
        return {
            combos: state.combos.map((combo) => ({
                id: combo.id,
                canonicalScore: combo.data.canonicalScore,
                canonicalScoreSummary: combo.data.canonicalScoreSummary,
                canonicalScoreBatchSummary:
                    combo.data.canonicalScoreBatchSummary,
                canonicalScorePresentation:
                    combo.data.canonicalScorePresentation,
                canonicalDamagePresentation:
                    combo.data.canonicalDamagePresentation,
                canonicalRangePlan: combo.data.canonicalRangePlan,
            })),
            canonicalTotalDamagePresentation:
                state.canonicalTotalDamagePresentation,
        };
    }

    function publishCanonicalDisplayFeedback(presentation, metadata = {}) {
        Object.assign(
            attackData.canonicalDisplayFeedback,
            createAttackCanonicalDisplayFeedback(presentation)
        );
        if (metadata.scoreDisplaySuppressed !== true) {
            Object.assign(
                attackData.canonicalScoreDisplayFeedback,
                createAttackCanonicalScoreDisplayFeedback(presentation?.score)
            );
            attackData.canonicalScoreDisplayPresentation = presentation?.score
                ?? null;
        }
    }

    function publishCanonicalDisplayRejection(presentation) {
        Object.assign(
            attackData.canonicalDisplayFeedback,
            createAttackCanonicalDisplayFeedback(presentation)
        );
        attackData.canonicalScoreDisplayPresentation = null;
        attackData.canonicalScoreDisplayFeedback.status = 'idle';
        attackData.canonicalScoreDisplayFeedback.plan = null;
        attackData.canonicalScoreDisplayFeedback.error = null;
    }

    const canonicalCalculationRunner = createAttackCanonicalRunner({
        state: attackData,
        calculationClient: canonicalCalculationClient,
        createPresentation: (
            batchResult,
            rangePlans,
            request,
            scoreRequest
        ) =>
            createAttackCanonicalDisplayPresentation(batchResult, {
                displayRequest: request ?? createAttackDisplayRequestSnapshot(displayRequest),
                scoreDisplayRequest: scoreRequest
                    ?? createAttackDisplayRequestSnapshot(scoreDisplayRequest),
                rangePlans,
                policy: displayRangePolicy,
            }),
        createDisplayPresentation: ({
            state,
            displayRequest: request,
            scoreDisplayRequest: scoreRequest,
        }) =>
            createAttackCanonicalDisplayPresentationFromCanonical(
                createCanonicalDisplaySource(state),
                {
                    displayRequest: request ?? createAttackDisplayRequestSnapshot(displayRequest),
                    scoreDisplayRequest: scoreRequest
                        ?? createAttackDisplayRequestSnapshot(scoreDisplayRequest),
                    policy: displayRangePolicy,
                }
            ),
        onPresentation: publishCanonicalDisplayFeedback,
        onDisplayRejected: publishCanonicalDisplayRejection,
        onError: (error) => {
            attackData.canonicalDisplayPresentation = null;
            attackData.canonicalScoreDisplayPresentation = null;
            attackData.canonicalDisplayFeedback.status = 'error';
            attackData.canonicalDisplayFeedback.plan = null;
            attackData.canonicalDisplayFeedback.error = error;
            attackData.canonicalScoreDisplayFeedback.status = 'error';
            attackData.canonicalScoreDisplayFeedback.plan = null;
            attackData.canonicalScoreDisplayFeedback.error = error;
            console.error('Failed to update canonical attack', error);
        },
    });

    function publishCanonicalDisplayResourceRejection(plan) {
        attackData.canonicalDisplayPresentation = null;
        attackData.canonicalScoreDisplayPresentation = null;
        attackData.canonicalDisplayFeedback.status = 'rejected';
        attackData.canonicalDisplayFeedback.plan = plan;
        attackData.canonicalDisplayFeedback.error = null;
        attackData.canonicalScoreDisplayFeedback.status = 'idle';
        attackData.canonicalScoreDisplayFeedback.plan = null;
        attackData.canonicalScoreDisplayFeedback.error = null;
    }

    function publishCanonicalDisplayError(error) {
        attackData.canonicalDisplayPresentation = null;
        attackData.canonicalScoreDisplayPresentation = null;
        attackData.canonicalDisplayFeedback.status = 'error';
        attackData.canonicalDisplayFeedback.plan = null;
        attackData.canonicalDisplayFeedback.error = error;
        attackData.canonicalScoreDisplayFeedback.status = 'error';
        attackData.canonicalScoreDisplayFeedback.plan = null;
        attackData.canonicalScoreDisplayFeedback.error = error;
    }

    function publishCanonicalScoreDisplayResourceRejection(plan) {
        attackData.canonicalScoreDisplayPresentation = null;
        attackData.canonicalScoreDisplayFeedback.status = 'rejected';
        attackData.canonicalScoreDisplayFeedback.plan = plan;
        attackData.canonicalScoreDisplayFeedback.error = null;
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

    function preflightCanonicalScoreDisplay(request) {
        try {
            const plan = planDisplayWindowResources(
                { min: request.min, max: request.max },
                displayRangePolicy
            );
            if (!plan.accepted) {
                canonicalCalculationRunner.invalidateScoreDisplay();
                publishCanonicalScoreDisplayResourceRejection(plan);
                return false;
            }
            return true;
        } catch (error) {
            canonicalCalculationRunner.invalidateScoreDisplay();
            attackData.canonicalScoreDisplayPresentation = null;
            attackData.canonicalScoreDisplayFeedback.status = 'error';
            attackData.canonicalScoreDisplayFeedback.plan = null;
            attackData.canonicalScoreDisplayFeedback.error = error;
            return false;
        }
    }

    function runCanonicalCalculation(
        request = displayRequest,
        scoreRequest = scoreDisplayRequest
    ) {
        const snapshot = createAttackDisplayRequestSnapshot(request);
        const scoreSnapshot = createAttackDisplayRequestSnapshot(scoreRequest);
        if (!preflightCanonicalDisplay(snapshot)) {
            return Promise.resolve(false);
        }
        const scoreDisplayReady = preflightCanonicalScoreDisplay(scoreSnapshot);
        if (!scoreDisplayReady) {
            // A Score display resource rejection is presentation-local. The
            // input/Damage lane must still replace the old canonical batch,
            // while the rejected Score request stays suppressed.
            return canonicalCalculationRunner.run({
                displayRequest: snapshot,
                rangePolicy: createAttackRangePolicy(snapshot),
            });
        }
        return canonicalCalculationRunner.run({
            displayRequest: snapshot,
            scoreDisplayRequest: scoreSnapshot,
            rangePolicy: createAttackRangePolicy(
                snapshot,
                {},
                scoreSnapshot
            ),
        });
    }

    watch(
        () => attackData.combos.map((combo) => ({
            id: combo.id,
            params: combo.data.params,
        })),
        () => {
            for (const combo of attackData.combos) {
                ensureCanonicalComboData(combo.data);
            }
            void runCanonicalCalculation();
        },
        { deep: true }
    );

    onMounted(() => {
        for (const combo of attackData.combos) {
            ensureCanonicalComboData(combo.data);
        }
        void runCanonicalCalculation();
    });

    onUnmounted(() => {
        canonicalCalculationRunner.dispose();
        clearCanonicalAttackState(attackData);
    });

    const canonicalDisplayPresentation = computed(() =>
        attackData.canonicalDisplayPresentation
    );

    const canonicalScoreDisplayPresentation = computed(() =>
        attackData.canonicalScoreDisplayPresentation
    );

    const canonicalSummaryReady = computed(() =>
        attackData.canonicalDisplayPresentation?.status === 'ready'
    );

    const canonicalFeedbackNotice = computed(() =>
        attackData.canonicalFeedback?.status === 'rejected'
            || attackData.canonicalFeedback?.status === 'error'
            ? attackData.canonicalFeedback
            : {status: 'idle', plan: null, error: null}
    );

    function onDisplayValidated(request) {
        const snapshot = createAttackDisplayRequestSnapshot(request);
        displayRequest.min = snapshot.min;
        displayRequest.max = snapshot.max;
        displayRequest.mode = snapshot.mode;

        if (!preflightCanonicalDisplay(snapshot)) {
            return;
        }

        if (attackData.canonicalTotalDamageReady !== true) {
            void runCanonicalCalculation(snapshot);
            return;
        }

        try {
            const scoreSnapshot = createAttackDisplayRequestSnapshot(
                scoreDisplayRequest
            );
            const scoreDisplayReady = preflightCanonicalScoreDisplay(
                scoreSnapshot
            );
            const refreshed = canonicalCalculationRunner.refreshPresentation({
                displayRequest: snapshot,
                scoreDisplayRequest: scoreSnapshot,
                calculationOptions: {
                    rangePolicy: scoreDisplayReady
                        ? createAttackRangePolicy(
                            snapshot,
                            {},
                            scoreSnapshot
                        )
                        : createAttackRangePolicy(snapshot),
                },
            });
            if (!refreshed) {
                attackData.canonicalDisplayPresentation = null;
            }
        } catch (error) {
            publishCanonicalDisplayError(error);
        }
    }

    function onScoreDisplayValidated(request) {
        const snapshot = createAttackDisplayRequestSnapshot(request);
        scoreDisplayRequest.min = snapshot.min;
        scoreDisplayRequest.max = snapshot.max;
        scoreDisplayRequest.mode = snapshot.mode;

        if (!preflightCanonicalScoreDisplay(snapshot)) {
            return;
        }

        if (attackData.canonicalTotalDamageReady !== true) {
            void runCanonicalCalculation(displayRequest, snapshot);
            return;
        }

        try {
            const refreshed = canonicalCalculationRunner.refreshPresentation({
                displayRequest: createAttackDisplayRequestSnapshot(displayRequest),
                scoreDisplayRequest: snapshot,
                scoreOnly: true,
                calculationOptions: {
                    rangePolicy: createAttackRangePolicy(
                        createAttackDisplayRequestSnapshot(displayRequest),
                        {},
                        snapshot
                    ),
                },
            });
            if (!refreshed) {
                canonicalCalculationRunner.invalidateScoreDisplay();
                attackData.canonicalScoreDisplayPresentation = null;
            }
        } catch (error) {
            canonicalCalculationRunner.invalidateScoreDisplay();
            attackData.canonicalScoreDisplayPresentation = null;
            attackData.canonicalScoreDisplayFeedback.status = 'error';
            attackData.canonicalScoreDisplayFeedback.plan = null;
            attackData.canonicalScoreDisplayFeedback.error = error;
        }
    }

</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel :attackData="attackData"/></v-col></v-row>
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
