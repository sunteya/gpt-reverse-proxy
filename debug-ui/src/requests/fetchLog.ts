import type { LogEntry } from '~/models/LogEntry'

export async function fetchLog(logPath: string): Promise<LogEntry[]> {
  try {
    const baseUrl = import.meta.env.BASE_URL
    const response = await fetch(`${baseUrl}${logPath}`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const text = await response.text()
    const lines = text.trim().split('\n').filter(line => line.length > 0)
    return lines.map(line => JSON.parse(line))
  } catch (e: any) {
    throw new Error(`Failed to load or parse log file: ${e.message}`)
  }
}

