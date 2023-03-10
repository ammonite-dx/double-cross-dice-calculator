<template>
  <v-container class="pa-6" fluid>
    <v-row><v-col cols="12"><AboutPanel /></v-col></v-row>
    <v-row><v-col cols="12"><UseCasePanel /></v-col></v-row>
  </v-container>
</template>

<script setup>
  import AboutPanel from '@/components/Home/AboutPanel.vue';
  import UseCasePanel from '@/components/Home/UseCasePanel.vue';
</script>