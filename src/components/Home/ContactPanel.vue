<script setup>
    import '@/assets/fontello/css/fontello.css';
</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon>mdi-contacts-outline</v-icon> お問い合わせ</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text class="pa-6 ma-0 text-md-body-1 text-caption">
            <v-row class="ma-0">
                DCDCに関する質問・要望・不具合の報告等には、紹介動画のコメントまたは作者TwitterのDMをご利用ください。
            </v-row>
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