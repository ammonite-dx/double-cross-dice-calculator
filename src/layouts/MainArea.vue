<script setup>
    import CalculationErrorBoundary from '@/components/CalculationErrorBoundary.vue';
</script>

<template>
  <v-main>
    <router-view v-slot="{ Component }">
      <CalculationErrorBoundary>
        <Suspense>
          <template #default>
            <div>
              <component :is="Component" />
            </div>
          </template>
          <template #fallback>
            <v-container class="pa-6 text-center">
              <v-progress-circular indeterminate color="primary" />
            </v-container>
          </template>
        </Suspense>
      </CalculationErrorBoundary>
    </router-view>
    <v-footer color="secondary">
        <v-container>
            <p class="ma-0 white--text text-caption text-center">
                <span>本作は、「矢野俊策」「有限会社F.E.A.R.」が権利を有する『ダブルクロス The 3rd Edition』の二次創作物です。</span><span>(C)矢野俊策/F.E.A.R.</span>
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
