<script setup>

    import { onUnmounted,watch } from 'vue';
    import { calculationClient } from '@/application/CalculationClient';
    import BacktrackForm from './BacktrackForm.vue';

    const props = defineProps(['backtrackData']);

    let calculationRevision = 0;
    onUnmounted(() => {
        calculationRevision += 1;
    });
    watch(props.backtrackData.params, async () => {
        const revision = ++calculationRevision;
        try {
            const result = await calculationClient.calculateBacktrack(props.backtrackData.params);
            if (revision !== calculationRevision) {
                return;
            }
            props.backtrackData.finalEncroachment = result;
        } catch (error) {
            console.error('Failed to update backtrack', error);
        }
    });

</script>

<template>
    <v-container class="pa-4">
        <v-container class="pa-0">
            <BacktrackForm :params="backtrackData.params"/>
        </v-container>
    </v-container>
</template>
