<script setup>
  import AboutPanel from '@/components/Home/AboutPanel.vue';
  import NewsPanel from '@/components/Home/NewsPanel.vue';
  import UseCasePanel from '@/components/Home/UseCasePanel.vue';
  import MoviePanel from '@/components/Home/MoviePanel.vue';
  import ContactPanel from '@/components/Home/ContactPanel.vue';
</script>

<template>
  <v-container class="pa-6" fluid>
    <v-row><v-col cols="12"><AboutPanel /></v-col></v-row>
    <v-row><v-col cols="12"><NewsPanel /></v-col></v-row>
    <v-row><v-col cols="12"><UseCasePanel /></v-col></v-row>
    <v-row><v-col cols="12"><MoviePanel /></v-col></v-row>
    <v-row><v-col cols="12"><ContactPanel /></v-col></v-row>
  </v-container>
</template>