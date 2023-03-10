<script setup>

    import SummaryTable from './SummaryTable.vue';
    const props = defineProps(['attackData']);

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon>mdi-file-chart-outline</v-icon> サマリー</v-card-title>
        <v-divider class="mx-2" />
        <v-container class="px-6 py-0">
            <v-card-text class="pt-0 pb-2 text-md-body-1 text-caption">
                <SummaryTable :attackData="props.attackData"/>
            </v-card-text>
        </v-container>
    </v-card>
</template>