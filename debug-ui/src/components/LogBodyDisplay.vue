<script setup lang="ts">
import { computed } from 'vue'
import type { LogBodyEntry } from '~/models/LogEntry'
import Well from '~/components/Well.vue'
const props = defineProps<{ logs: LogBodyEntry[] }>()
const userLogs = computed(() => props.logs.filter(l => l.leg === 'user'))
const upstreamLogs = computed(() => props.logs.filter(l => l.leg === 'upstream'))
</script>

<template>
  <div class="bg-green-100 p-2 rounded-md mb-2">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
      <div>
        <div class="font-semibold text-green-900">(user)</div>
        <div class="mt-1">
          <div v-if="userLogs.length === 0" class="text-sm text-gray-600">无</div>
          <Well v-for="(log, i) in userLogs" :key="'u-'+log.timestamp+'-'+i">{{ JSON.stringify(log.payload, null, 2) }}</Well>
        </div>
      </div>
      <div>
        <div class="font-semibold text-green-900">(upstream)</div>
        <div class="mt-1">
          <div v-if="upstreamLogs.length === 0" class="text-sm text-gray-600">无</div>
          <Well v-for="(log, i) in upstreamLogs" :key="'a-'+log.timestamp+'-'+i">{{ JSON.stringify(log.payload, null, 2) }}</Well>
        </div>
      </div>
    </div>
  </div>
</template>

