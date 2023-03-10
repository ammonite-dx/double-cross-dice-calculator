<script setup>

    import InputForm from './InputForm.vue';
    const props = defineProps(['backtrackData']);

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon>mdi-tune-variant</v-icon> バックトラック条件</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text class="pa-0 text-md-body-1 text-caption">
            <InputForm :backtrackData="backtrackData"/>
        </v-card-text>
    </v-card>
</template>