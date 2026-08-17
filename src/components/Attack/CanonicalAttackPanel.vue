<script setup>

    import { computed } from 'vue';
    import RangePlanNotice from '@/components/RangePlanNotice.vue';
    import {
        createCanonicalDistributionDisplay,
        formatCanonicalComboName,
    } from './CanonicalAttackPanel';

    const props = defineProps({
        attackData: {
            type: Object,
            required: true,
        },
    });

    const canonicalOptIn = computed({
        get: () => props.attackData?.canonicalOptIn === true,
        set: (value) => {
            if (props.attackData && typeof props.attackData === 'object') {
                props.attackData.canonicalOptIn = value === true;
            }
        },
    });

    const canonicalStatus = computed(() => {
        const status = props.attackData?.canonicalFeedback?.status;
        return ['idle', 'loading', 'ready', 'rejected', 'error'].includes(status)
            ? status
            : 'idle';
    });

    const canonicalStatusLabel = computed(() => ({
        idle: '待機中（オプトイン未実行）',
        loading: '計算中',
        ready: '計算完了',
        rejected: '計算範囲の制約により未完了',
        error: '計算エラー',
    }[canonicalStatus.value]));

    const canonicalStatusType = computed(() => ({
        idle: 'info',
        loading: 'info',
        ready: 'success',
        rejected: 'warning',
        error: 'error',
    }[canonicalStatus.value]));

    const canonicalTotalDamageReady = computed(() =>
        canonicalOptIn.value
        && props.attackData?.canonicalTotalDamageReady === true
    );

    const totalDisplay = computed(() =>
        createCanonicalDistributionDisplay(
            props.attackData?.canonicalTotalDamagePresentation
        )
    );

    const comboDisplays = computed(() => {
        const combos = Array.isArray(props.attackData?.combos)
            ? props.attackData.combos
            : [];

        return combos.map((combo, index) => ({
            index,
            name: formatCanonicalComboName(combo?.name, index),
            display: createCanonicalDistributionDisplay(
                combo?.data?.canonicalDamagePresentation
            ),
        }));
    });

</script>

<template>
    <v-card class="ma-0">
        <v-card-title>canonical Attack診断</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text>
            <v-switch
                v-model="canonicalOptIn"
                label="canonical計算を有効化"
                color="primary"
                hide-details="auto"
                density="compact"
                class="mb-4"
            />
            <v-alert
                :type="canonicalStatusType"
                :title="canonicalStatusLabel"
                variant="tonal"
                density="compact"
                class="mb-4"
                role="status"
                aria-live="polite"
            />
            <RangePlanNotice :feedback="props.attackData?.canonicalFeedback" />

            <template v-if="canonicalTotalDamageReady">
                <v-card variant="outlined" class="mb-4">
                    <v-card-subtitle>全体のcanonical結果</v-card-subtitle>
                    <v-card-text>
                        <p class="mb-1">{{ totalDisplay.expectedValue }}</p>
                        <p class="mb-1">{{ totalDisplay.explicitMax }}</p>
                        <p class="mb-1">{{ totalDisplay.support }}</p>
                        <p class="mb-0">{{ totalDisplay.overflow }}</p>
                    </v-card-text>
                </v-card>

                <v-row v-if="comboDisplays.length > 0">
                    <v-col
                        v-for="combo in comboDisplays"
                        :key="combo.index"
                        cols="12"
                        md="6"
                    >
                        <v-card variant="outlined" class="h-100">
                            <v-card-subtitle>{{ combo.name }}</v-card-subtitle>
                            <v-card-text>
                                <p class="mb-1">{{ combo.display.expectedValue }}</p>
                                <p class="mb-1">{{ combo.display.explicitMax }}</p>
                                <p class="mb-1">{{ combo.display.support }}</p>
                                <p class="mb-0">{{ combo.display.overflow }}</p>
                            </v-card-text>
                        </v-card>
                    </v-col>
                </v-row>
            </template>
        </v-card-text>
    </v-card>
</template>
