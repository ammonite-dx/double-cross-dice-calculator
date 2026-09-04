<script setup>

    import { computed } from 'vue';
    import { formatRangeFeedback } from '@/runtime/CalculationFeedback';

    const props = defineProps({
        feedback: {
            type: Object,
            default: null,
        },
    });
    const display = computed(() => formatRangeFeedback(props.feedback));

</script>

<template>
    <v-alert
        v-if="display"
        :type="display.type"
        :title="display.title"
        :role="display.type === 'error' ? 'alert' : 'status'"
        :aria-live="display.type === 'error' ? 'assertive' : 'polite'"
        variant="tonal"
        density="compact"
        class="mb-4"
    >
        <ul class="pl-4">
            <li v-for="(reason, index) in display.reasons" :key="`${index}:${reason}`">{{ reason }}</li>
        </ul>
        <p
            v-if="display.metrics.time !== null || display.metrics.memory !== null"
            class="mb-0 mt-2"
        >
            <span v-if="display.metrics.time !== null">推定計算時間: {{ display.metrics.time }}</span>
            <span v-if="display.metrics.time !== null && display.metrics.memory !== null">、</span>
            <span v-if="display.metrics.memory !== null">推定メモリ: {{ display.metrics.memory }}</span>
        </p>
        <ul v-if="display.overflow.length > 0" class="pl-4 mt-2">
            <li v-for="(overflow, index) in display.overflow" :key="`${index}:${overflow}`">{{ overflow }}</li>
        </ul>
        <p class="mb-0 mt-2">{{ display.action }}</p>
    </v-alert>
</template>
