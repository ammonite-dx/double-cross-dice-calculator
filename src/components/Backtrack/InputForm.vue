<script setup>

    import { watch } from 'vue';
    import { getFinalEncroachment } from '@/data/Calculator';
    import BacktrackForm from './BacktrackForm.vue';

    const props = defineProps(['backtrackData']);

    watch(props.backtrackData.params, () => {
        props.backtrackData.finalEncroachment = getFinalEncroachment(props.backtrackData.params);
    });

</script>

<template>
    <v-container class="pa-4">
        <v-container class="pa-0">
            <BacktrackForm :params="backtrackData.params"/>
        </v-container>
    </v-container>
</template>