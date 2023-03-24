<script setup>

    import InputForm from './InputForm.vue';
    import { mdiTuneVariant } from '@mdi/js'

    const props = defineProps(['checkData']);

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiTuneVariant"/> 判定条件</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text class="pa-0 text-md-body-1 text-caption">
            <InputForm :checkData="checkData"/>
        </v-card-text>
    </v-card>
</template>