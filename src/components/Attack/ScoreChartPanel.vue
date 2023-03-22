<script setup>

    import { ref } from 'vue';
    import ScoreChart from './ScoreChart.vue';
    import ScoreSettingForm from './ScoreSettingForm.vue';

    const props = defineProps(['attackData']);
    const setting = ref({min:0, max:100, mode:'達成値がXとなる確率を表示'});

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon>mdi-chart-line</v-icon> 達成値分布</v-card-title>
        <v-divider class="mx-2" />
        <v-container class="pa-0">
            <v-card-text class="text-md-body-1 text-caption">
                <ScoreChart :attackData="props.attackData" :setting="setting"/>
                <ScoreSettingForm :setting="setting"/>
            </v-card-text>
        </v-container>
    </v-card>
</template>