<script setup>
    import { mdiAlertOutline,mdiChevronRight,mdiYoutube,mdiTwitter } from '@mdi/js';
    import niconico from '@/components/Icon/Niconico.vue'
</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiAlertOutline"/> 利用上の注意</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text class="pa-6 ma-0 text-md-body-1 text-caption">
            <v-list density="compact">
                <v-list-item><v-icon :icon="mdiChevronRight"/>製作者はDCDCの利用により生じた一切のトラブルの責任を負いかねます。</v-list-item>
                <v-list-item><v-icon :icon="mdiChevronRight"/>予告なく内容を更新したり、公開を停止したりする可能性があります。</v-list-item>
                <v-list-item><v-icon :icon="mdiChevronRight"/>DCDCに関する質問・要望がある場合や、不具合を発見した場合は、お手数ですが、紹介動画へコメントするか、作者TwitterのDMまでご連絡ください。</v-list-item>
            </v-list>
            <v-row class="mx-0 my-2">
                <v-col md="4" cols="12" class="ma-0 pa-2"><v-btn :prepend-icon="mdiYoutube" variant="outlined" block disabled>紹介動画 (Youtube)</v-btn></v-col>
                <v-col md="4" cols="12" class="ma-0 pa-2"><v-btn href="https://www.nicovideo.jp/watch/sm41983879" target="_blank" :prepend-icon="niconico" variant="outlined" block>紹介動画 (ニコニコ動画)</v-btn></v-col>
                <v-col md="4" cols="12" class="ma-0 pa-2"><v-btn href="https://twitter.com/Ammonite_dx" target="_blank" :prepend-icon="mdiTwitter" variant="outlined" block>作者Twitter</v-btn></v-col>
            </v-row>
        </v-card-text>
    </v-card>
</template>