<script setup>

    import FinalEncroachmentChart from './FinalEncroachmentChart.vue';
    import { mdiChartLine } from '@mdi/js'

    const props = defineProps(['backtrackData']);

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiChartLine"/> 最終侵蝕率分布</v-card-title>
        <v-divider class="mx-2" />
        <v-container class="pa-0">
            <v-card-text class="text-md-body-1 text-caption">
                <v-row class="ma-0">
                    <v-col md="4" cols="6" class="px-1 py-2"><FinalEncroachmentChart :finalEncroachment="backtrackData.finalEncroachment" mode="single"/></v-col>
                    <v-col md="4" cols="6" class="pa-1 py-2"><FinalEncroachmentChart :finalEncroachment="backtrackData.finalEncroachment" mode="double"/></v-col>
                    <v-col md="4" cols="6" class="pa-1 py-2"><FinalEncroachmentChart :finalEncroachment="backtrackData.finalEncroachment" mode="second"/></v-col>
                </v-row>
            </v-card-text>
        </v-container>
    </v-card>
</template>