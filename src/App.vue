<script setup>

  import { ref } from 'vue';
  import AppBarArea from '@/layouts/AppBarArea.vue';
  import MainArea from '@/layouts/MainArea.vue';
  import NavigationDrawerArea from '@/layouts//NavigationDrawerArea.vue';

  const drawer = ref(false);

</script>

<template>
  <v-app>
    <MainArea/>
    <AppBarArea @change="drawer=!drawer"/>
    <NavigationDrawerArea v-model="drawer"/>
  </v-app>
</template>
