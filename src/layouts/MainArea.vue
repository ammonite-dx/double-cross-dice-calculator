<template>
  <v-main>
    <router-view />
    <v-footer color="secondary">
        <v-container>
            <p class="ma-0 white--text text-caption text-center">
                <span>本作は、「矢野俊作」「有限会社F.E.A.R.」が権利を有する『ダブルクロス The 3rd Edition』の二次創作物です。</span><span>(C)矢野俊作/F.E.A.R.</span>
            </p>
        </v-container>
    </v-footer>
  </v-main>
</template>

<style scoped>
    span{
        display: inline-block;
    }
</style>