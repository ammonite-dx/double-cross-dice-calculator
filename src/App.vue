<script setup>

  import { ref } from 'vue';
  import AppBarArea from '@/layouts/AppBarArea.vue';
  import FooterArea from '@/layouts/FooterArea.vue';
  import MainArea from '@/layouts/MainArea.vue';
  import NavigationDrawerArea from '@/layouts//NavigationDrawerArea.vue';

  const drawer = ref(false);

</script>

<template>
  <v-app>
    <v-main class="pa-0">
      <MainArea/>
      <FooterArea/>
    </v-main>
    <AppBarArea @change="drawer=!drawer"/>
    <NavigationDrawerArea v-model="drawer"/>
  </v-app>
</template>
