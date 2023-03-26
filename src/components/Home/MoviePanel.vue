<script setup>

    import { computed } from 'vue';
    import { useDisplay } from 'vuetify'
    import { mdiYoutube } from '@mdi/js';
    import YouTube from 'vue3-youtube'

    const { width } = useDisplay()
    const movieWidth = computed(() => Math.min(640,width.value*0.75));
    const movieHeight = computed(() => movieWidth.value*9.0/16.0)

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiYoutube"/> 紹介動画</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text class="pa-6 ma-0 text-md-body-1 text-caption" style="aspect-ratio: 16/9;">
            <YouTube src="https://www.youtube.com/watch?v=rwkFp7NDH8w" @ready="onReady" ref="youtube" width="100%"/>
        </v-card-text>
    </v-card>
</template>