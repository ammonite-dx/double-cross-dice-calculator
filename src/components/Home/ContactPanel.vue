<script setup>
    import '@/assets/fontello/css/fontello.css';
</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon>mdi-alert-outline</v-icon> 利用上の注意</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text class="pa-6 ma-0 text-md-body-1 text-caption">
            <v-list density="compact">
                <v-list-item><v-icon>mdi-chevron-right</v-icon>製作者はDCDCの利用により生じた一切のトラブルの責任を負いかねます。</v-list-item>
                <v-list-item><v-icon>mdi-chevron-right</v-icon>予告なく内容を更新したり、公開を停止したりする可能性があります。</v-list-item>
                <v-list-item><v-icon>mdi-chevron-right</v-icon>DCDCに関する質問・要望がある場合や、不具合を発見した場合は、お手数ですが、紹介動画へコメントするか、作者TwitterのDMまでご連絡ください。</v-list-item>
            </v-list>
            <v-row class="mx-0 my-2">
                <v-col cols="4" class="ma-0">
                    <v-row class="d-flex justify-center ma-0 pb-2"><v-btn icon="mdi-youtube" variant="outlined" disabled/></v-row>
                    <v-row class="d-flex justify-center ma-0">紹介動画 (YouTube)</v-row>
                </v-col>
                <v-col cols="4" class="ma-0">
                    <v-row class="d-flex justify-center ma-0 pb-2"><v-btn icon="icon-niconico" variant="outlined" disabled/></v-row>
                    <v-row class="d-flex justify-center ma-0">紹介動画 (ニコニコ)</v-row>
                </v-col>
                <v-col cols="4" class="ma-0">
                    <v-row class="d-flex justify-center ma-0 pb-2"><v-btn href="https://twitter.com/Ammonite_dx" target="_blank" icon="mdi-twitter" variant="outlined"/></v-row>
                    <v-row class="d-flex justify-center ma-0">Twitter</v-row>
                </v-col>
            </v-row>
        </v-card-text>
    </v-card>
</template>