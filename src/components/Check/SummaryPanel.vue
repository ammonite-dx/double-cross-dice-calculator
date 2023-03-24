<script setup>

    import SummaryTable from './SummaryTable.vue';
    import { mdiFileChartOutline } from '@mdi/js'

    const props = defineProps(['checkData']);

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiFileChartOutline"/> サマリー</v-card-title>
        <v-divider class="mx-2" />
        <v-container class="px-6 py-0">
            <v-card-text class="pt-0 pb-2 text-md-body-1 text-caption">
                <SummaryTable :checkData="checkData"/>
            </v-card-text>
        </v-container>
    </v-card>
</template>