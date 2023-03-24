<template>
  <v-app-bar app color="secondary">
      <v-app-bar-nav-icon color="white" @click="invert"/>
      <router-link :to="'/'"><v-img src="@/assets/logo.svg" height="40px" width="160px"/></router-link>
  </v-app-bar>
</template>

<script setup>
  const emit = defineEmits(['change']);
  const invert = () => {emit('change')};
</script>