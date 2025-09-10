import fs from 'fs/promises'
import { DumpEntry } from '$$/lib/Dumper'
import { EventSourceParserStream } from 'eventsource-parser/stream'
import { EventSourceMessage } from 'eventsource-parser'

export async function loadChunksFromLogFile(file:string): Promise<DumpEntry[]> {
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

export async function convertLogFileToEvents(file: string, subject: TransformStream<string, string>) {
  const inputEntries = await loadChunksFromLogFile(file)
  const inputStream = new ReadableStream<string>({
    start(controller) {
      inputEntries
        .filter(it => it.leg == 'upstream' && it.direction == 'response' && it.event == 'chunk')
        .forEach(it => controller.enqueue(it.payload.text))
      controller.close()
    }
  })

  const messages = await collectStream(
    inputStream.pipeThrough(subject)
      .pipeThrough(new EventSourceParserStream())
  )
  return messages
}
