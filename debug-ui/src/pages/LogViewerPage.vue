<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LogEntry } from '~/models/LogEntry'
import { fetchLog } from '~/requests/fetchLog'
import LogDisplay from '~/components/LogDisplay.vue'

const allLogLines = ref<LogEntry[]>([])
const error = ref<string | null>(null)
const logPath = ref<string | null>(null)
const activeTab = ref<'request' | 'response'>('request')

const requestLogs = computed(() => allLogLines.value.filter(item => item.direction === 'request'))
const responseLogs = computed(() => allLogLines.value.filter(item => item.direction === 'response'))

const rawLogPath = window.location.search.substring(1)
if (rawLogPath) {
  const decoded = decodeURIComponent(rawLogPath)
  const isUrl = decoded.includes('://')
  const normalized = isUrl ? decoded : (decoded.startsWith('/') ? decoded : `/${decoded}`)
  logPath.value = normalized
  try {
    allLogLines.value = await fetchLog(logPath.value)
  } catch (e: any) {
    error.value = e.message
  }
}
</script>

<template>
  <main class="mx-auto pt-4 px-10 mb-10 font-sans">
    <h1 class="text-2xl font-bold mb-4">Log Viewer</h1>
    <div v-if="logPath">
      <p class="mb-2">Loading log for: <strong class="font-bold">{{ logPath }}</strong></p>
      <div v-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md relative mb-4">
        {{ error }}
      </div>
      <div v-if="allLogLines.length > 0">
        <div class="border-b border-gray-200">
          <nav class="-mb-px flex space-x-8" aria-label="Tabs">
            <button @click="activeTab = 'request'" :class="[activeTab === 'request' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm']">
              Request
            </button>
            <button @click="activeTab = 'response'" :class="[activeTab === 'response' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm']">
              Response
            </button>
          </nav>
        </div>
        <div class="mt-4">
          <div v-if="activeTab === 'request'">
            <LogDisplay :logs="requestLogs" />
          </div>
          <div v-if="activeTab === 'response'">
            <LogDisplay :logs="responseLogs" />
          </div>
        </div>
      </div>
    </div>
    <div v-else>
      <p class="mb-2">No log file specified in the URL.</p>
      <p>Please provide a path like: <code class="bg-gray-200 p-1 rounded-sm">?log/path/to/your/file.jsonl</code></p>
    </div>
  </main>
</template>
