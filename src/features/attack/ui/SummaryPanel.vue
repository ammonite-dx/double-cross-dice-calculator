<script setup>

    import SummaryTable from './SummaryTable.vue';
    import { mdiFileChartOutline } from '@mdi/js'

    const props = defineProps({
        combos: {
            type: Array,
            required: true,
        },
        presentation: {
            type: Object,
            default: null,
        },
        scorePresentation: {
            type: Object,
            default: null,
        },
    });

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiFileChartOutline"/> サマリー</v-card-title>
        <v-divider class="mx-2" />
        <v-container class="px-6 py-0">
            <v-card-text class="pt-0 pb-2 text-md-body-1 text-caption">
                <SummaryTable
                    :combos="props.combos"
                    :presentation="props.presentation"
                    :scorePresentation="props.scorePresentation"
                />
            </v-card-text>
        </v-container>
    </v-card>
</template>
