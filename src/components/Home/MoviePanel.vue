<script setup>
    import { mdiYoutube } from '@mdi/js';
</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiYoutube"/> 紹介動画</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text class="pa-6 ma-0 text-md-body-1 text-caption" align="center">
            <div class="youtube-wrap">
                <div class="youtube">
                    <iframe src="https://www.youtube.com/embed/rwkFp7NDH8w" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"/>
                </div>
            </div>
        </v-card-text>
    </v-card>
</template>

<style scoped>

    .youtube-wrap {
    max-width: 640px;
    }
    .youtube{
        position: relative;
        width: 100%;
        overflow: hidden;
        padding-bottom: 56.25%;
    }
    .youtube iframe{
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: none;
    }
</style>