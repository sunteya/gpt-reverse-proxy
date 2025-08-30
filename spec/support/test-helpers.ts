import fs from 'fs/promises'
import path from 'path'
import { DumpEntry } from '$$/lib/Dumper'

export async function loadChunksFromLogFile(dirname: string, filename:string): Promise<DumpEntry[]> {
  const file = path.resolve(dirname, filename)
  const content = await fs.readFile(file, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())
  return lines.map(line => JSON.parse(line) as DumpEntry)
}

export async function collectStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const chunks: T[] = []
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return chunks
}
