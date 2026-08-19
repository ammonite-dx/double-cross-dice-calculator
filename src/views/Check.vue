<script setup>

    import { computed, inject, onMounted, onUnmounted, reactive } from 'vue';
    import {
        CALCULATION_CLIENT_KEY,
        calculationClient as defaultCalculationClient,
    } from '@/application/CalculationClient';
    import {
        createCalculationFeedbackState,
        createLatestCalculationRunner,
        runInitialCalculation,
    } from '@/application/CalculationFeedback';
    import {
        DEFAULT_CHECK_DISPLAY_REQUEST,
        createCheckCalculationRequestSnapshot,
        createCheckDisplayRequestSnapshot,
    } from '@/application/CheckDisplayRequestSnapshot';
    import {
        CHECK_CANONICAL_PRESENTATION_DECISIONS,
        createCheckCanonicalPresentation,
    } from '@/application/CheckCanonicalPresentation';
    import {
        DEFAULT_DISPLAY_RANGE_PLANNER_POLICY,
        planDisplayWindowResources,
    } from '@/presentation';
    import { createCheckInputSnapshot } from '@/application/CheckInputSnapshot';
    import InputPanel from '@/components/Check/InputPanel.vue';
    import ChartPanel from '@/components/Check/ChartPanel.vue';
    import SummaryPanel from '@/components/Check/SummaryPanel.vue';

    const calculationClient = inject(
        CALCULATION_CLIENT_KEY,
        defaultCalculationClient
    );
    const displayRangePolicy = DEFAULT_DISPLAY_RANGE_PLANNER_POLICY;
    const initialDisplayRequest = createCheckDisplayRequestSnapshot(
        DEFAULT_CHECK_DISPLAY_REQUEST
    );
    const initialInputSnapshot = createCheckInputSnapshot({
        difficulty: { opposed: false, target: 0 },
        params: {
            action: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
            reaction: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
        },
    });
    const initialCalculationRequest = createCheckCalculationRequestSnapshot({
        ...initialInputSnapshot,
        displayRequest: initialDisplayRequest,
    });
    const rangeFeedback = reactive(createCalculationFeedbackState());
    const displayFeedback = reactive(createCalculationFeedbackState());
    const initialCalculation = await runInitialCalculation({
        feedback: rangeFeedback,
        calculate: (options) => calculationClient.calculateCheckCanonical(
            initialCalculationRequest.params,
            initialCalculationRequest.difficulty,
            {
                ...options,
                displayRequest: initialCalculationRequest.displayRequest,
                rangePolicy: initialCalculationRequest.rangePolicy,
            }
        ),
        onError: (error) => {
            console.error('Failed to initialize check calculation', error);
        },
    });
    const displayRequest = reactive({ ...initialDisplayRequest });
    const checkData = reactive({
        dfclty: { ...initialInputSnapshot.difficulty },
        params: {
            action: { ...initialInputSnapshot.params.action },
            reaction: { ...initialInputSnapshot.params.reaction },
        },
        score: initialCalculation?.score ?? null,
        scoreSummary: initialCalculation?.scoreSummary ?? null,
        resultReady: initialCalculation !== null,
        rangeFeedback,
    });
    let displayRecalculationKey = null;

    function buildPresentationForScore(score, request = displayRequest) {
        return createCheckCanonicalPresentation(
            { score },
            {
                displayWindow: { min: request.min, max: request.max },
                mode: request.mode,
                opposed: checkData.dfclty.opposed,
                policy: displayRangePolicy,
            }
        );
    }

    function buildPresentation(request = displayRequest) {
        if (!checkData.resultReady || checkData.score === null) {
            return null;
        }
        return buildPresentationForScore(checkData.score, request);
    }

    const presentation = computed(() => buildPresentation());

    function resetDisplayFeedback() {
        displayFeedback.status = 'idle';
        displayFeedback.plan = null;
        displayFeedback.error = null;
    }

    function getNotProjectableCode(reason) {
        if (reason === 'upper-bound-overflow') {
            return 'check-upper-bound-overflow';
        }
        if (reason === 'exact-overflow-overlap') {
            return 'check-exact-overflow-overlap';
        }
        return 'check-not-projectable';
    }

    function createNotProjectablePlan(result) {
        const sides = [result.action, result.reaction].filter(Boolean);
        const terminalSides = sides.filter((side) =>
            side.decision === CHECK_CANONICAL_PRESENTATION_DECISIONS.NOT_PROJECTABLE
            || side.decision === CHECK_CANONICAL_PRESENTATION_DECISIONS.RESOURCE_REJECTED
        );
        const feedbackSides = terminalSides.length > 0
            ? terminalSides
            : sides.filter((side) =>
                side.decision === CHECK_CANONICAL_PRESENTATION_DECISIONS.RECALCULATE
            );
        const warnings = feedbackSides.map((side) => {
            const code = side.decision
                === CHECK_CANONICAL_PRESENTATION_DECISIONS.RESOURCE_REJECTED
                ? side.plan.rejectionReasons?.[0] ?? 'display-point-count'
                : side.decision
                    === CHECK_CANONICAL_PRESENTATION_DECISIONS.RECALCULATE
                    ? 'check-not-projectable'
                : getNotProjectableCode(side.reason);
            return {
                code,
                severity: 'reject',
                message: 'Check display cannot safely project this window',
            };
        });
        return {
            accepted: false,
            status: 'resource-rejected',
            decision: 'terminal',
            reason: 'display-terminal',
            displayWindow: {
                min: displayRequest.min,
                max: displayRequest.max,
                pointCount: displayRequest.max - displayRequest.min + 1,
            },
            estimates: {
                pointCount: displayRequest.max - displayRequest.min + 1,
                float64Bytes: (displayRequest.max - displayRequest.min + 1) * Float64Array.BYTES_PER_ELEMENT,
                chartPoints: displayRequest.max - displayRequest.min + 1,
            },
            warnings,
            rejectionReasons: warnings.map(({ code }) => code),
        };
    }

    function publishDisplayPlan(plan) {
        displayFeedback.status = plan.accepted === false
            ? 'rejected'
            : plan.warnings?.length > 0
                ? 'warning'
                : 'idle';
        displayFeedback.plan = plan;
        displayFeedback.error = null;
    }

    function publishDisplayError(error) {
        displayFeedback.status = 'error';
        displayFeedback.plan = null;
        displayFeedback.error = error;
    }

    function preflightDisplayRequest(request = displayRequest) {
        const resourcePlan = planDisplayWindowResources(
            { min: request.min, max: request.max },
            displayRangePolicy
        );
        if (!resourcePlan.accepted) {
            publishDisplayPlan(resourcePlan);
            return false;
        }
        return true;
    }

    function updateDisplayFeedback(result = presentation.value) {
        if (!preflightDisplayRequest()) {
            return;
        }
        if (result === null) {
            resetDisplayFeedback();
            return;
        }
        if (
            result.decision === CHECK_CANONICAL_PRESENTATION_DECISIONS.RESOURCE_REJECTED
            || result.decision === CHECK_CANONICAL_PRESENTATION_DECISIONS.NOT_PROJECTABLE
            || result.decision === CHECK_CANONICAL_PRESENTATION_DECISIONS.RECALCULATE
        ) {
            publishDisplayPlan(createNotProjectablePlan(result));
            return;
        }
        const warningPlan = [result.action, result.reaction]
            .filter(Boolean)
            .map((side) => side.plan)
            .find((plan) => plan?.warnings?.length > 0);
        if (warningPlan) {
            publishDisplayPlan(warningPlan);
            return;
        }
        resetDisplayFeedback();
    }

    function displayRecalculationKeyFor(request) {
        return `${request.min}:${request.max}`;
    }

    function requestDisplayRecalculation(request) {
        const key = displayRecalculationKeyFor(request);
        if (displayRecalculationKey === key) {
            publishDisplayPlan(createNotProjectablePlan(buildPresentation(request)));
            return;
        }
        displayRecalculationKey = key;
        resetDisplayFeedback();
        void submitCheck(request);
    }

    const calculationRunner = createLatestCalculationRunner({
        feedback: rangeFeedback,
        snapshotRequest: createCheckCalculationRequestSnapshot,
        calculate: (snapshot) => calculationClient.calculateCheckCanonical(
            snapshot.params,
            snapshot.difficulty,
            snapshot
        ),
        clearResult: () => {
            checkData.score = null;
            checkData.scoreSummary = null;
            checkData.resultReady = false;
            resetDisplayFeedback();
        },
        commitResult: (result) => {
            let committedPresentation;
            try {
                committedPresentation = buildPresentationForScore(result.score);
            } catch (error) {
                displayRecalculationKey = null;
                publishDisplayError(error);
                return;
            }
            checkData.score = result.score;
            checkData.scoreSummary = result.scoreSummary;
            checkData.resultReady = true;
            if (
                committedPresentation?.decision
                === CHECK_CANONICAL_PRESENTATION_DECISIONS.RECALCULATE
            ) {
                requestDisplayRecalculation(displayRequest);
                return;
            }
            displayRecalculationKey = null;
            updateDisplayFeedback(committedPresentation);
        },
        onError: (error) => {
            console.error('Failed to update check', error);
        },
    });

    const submitCheck = (request = displayRequest) => {
        if (!preflightDisplayRequest(request)) {
            return Promise.resolve(false);
        }
        const calculationRequest = createCheckCalculationRequestSnapshot({
            difficulty: checkData.dfclty,
            params: checkData.params,
            displayRequest: request,
        });
        return calculationRunner.run(calculationRequest);
    };

    const onDfcltyValidated = (dfclty) => {
        checkData.dfclty = { ...dfclty };
        displayRecalculationKey = null;
        void submitCheck();
    };

    const onScoreValidated = ({ side, params }) => {
        if (side !== 'action' && side !== 'reaction') {
            return;
        }
        checkData.params[side] = { ...params };
        displayRecalculationKey = null;
        void submitCheck();
    };

    const onDisplayValidated = (request) => {
        const snapshot = createCheckDisplayRequestSnapshot(request);
        const windowChanged = snapshot.min !== displayRequest.min
            || snapshot.max !== displayRequest.max;
        displayRequest.min = snapshot.min;
        displayRequest.max = snapshot.max;
        displayRequest.mode = snapshot.mode;
        if (windowChanged) {
            displayRecalculationKey = null;
        }

        if (!preflightDisplayRequest(snapshot)) {
            return;
        }

        if (!checkData.resultReady || checkData.score === null) {
            resetDisplayFeedback();
            return;
        }

        let nextPresentation;
        try {
            nextPresentation = buildPresentation(snapshot);
        } catch (error) {
            publishDisplayError(error);
            return;
        }
        if (!windowChanged) {
            displayRecalculationKey = null;
            updateDisplayFeedback(nextPresentation);
            return;
        }
        if (
            nextPresentation?.decision
            === CHECK_CANONICAL_PRESENTATION_DECISIONS.RECALCULATE
        ) {
            requestDisplayRecalculation(snapshot);
            return;
        }
        displayRecalculationKey = null;
        updateDisplayFeedback(nextPresentation);
    };

    onMounted(() => {
        if (!checkData.resultReady && rangeFeedback.status !== 'rejected') {
            void calculationRunner.run(initialCalculationRequest);
        }
    });
    onUnmounted(() => calculationRunner.dispose());

</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel
            :checkData="checkData"
            @dfclty-validated="onDfcltyValidated"
            @score-validated="onScoreValidated"
        /></v-col></v-row>
        <v-row><v-col cols="12"><ChartPanel
            :checkData="checkData"
            :displayRequest="displayRequest"
            :presentation="presentation"
            :displayFeedback="displayFeedback"
            @display-validated="onDisplayValidated"
        /></v-col></v-row>
        <v-row v-if="checkData.resultReady"><v-col cols="12"><SummaryPanel :checkData="checkData"/></v-col></v-row>
    </v-container>
</template>
