<script setup lang="ts">
import LogViewerPage from './pages/LogViewerPage.vue'
</script>

<template>
  <Suspense>
    <template #default>
      <LogViewerPage />
    </template>
    <template #fallback>
      <div>Loading...</div>
    </template>
  </Suspense>
</template>
