import { describe, it, expect } from 'vitest'
import { CombineFinishChunkStream, FinishReasonCleanerStream } from '$$/patches/cursor-compatible'
import path from 'path'
import fs from 'fs/promises'
import { createParser, EventSourceMessage } from 'eventsource-parser'
import { loadChunksFromLogFile } from '$$/spec/support/test-helpers'

async function collectStream(stream: ReadableStream<string>): Promise<string[]> {
  const chunks: string[] = []
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

describe('FinishReasonCleanerStream', () => {
  it('should remove finish_reason from a single chunk', async () => {
    const inputStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('{"foo":"bar","finish_reason":null}')
        controller.close()
      }
    })

    const cleaner = new FinishReasonCleanerStream()
    const outputStream = inputStream.pipeThrough(cleaner)
    const result = await collectStream(outputStream)

    expect(result.join('')).toBe('{"foo":"bar"}')
  })

  it('convert real response', async () => {
    const inputEntries = await loadChunksFromLogFile(__dirname, "FinishReasonCleanerStream.20250828084314986.jsonl")

    const inputStream = new ReadableStream<string>({
      start(controller) {
        inputEntries
          .filter(it => it.leg == 'upstream' && it.direction == 'response' && it.event == 'chunk')
          .forEach(it => controller.enqueue(it.payload.text + "\n\n"))
        controller.close()
      }
    })

    const subject = new FinishReasonCleanerStream()
    const outputChucks = await collectStream(
      inputStream.pipeThrough(subject)
    )

    const messages = [] as EventSourceMessage[]
    const parser = createParser({
      onEvent: (event: EventSourceMessage) => {
        messages.push(event)
      },
    })
    for (const chunk of outputChucks) {
      parser.feed(chunk)
    }

    const finishMessages = messages.filter(message => {
      try {
        const json = JSON.parse(message.data)
        return ('finish_reason' in json.choices[0])
      } catch (e) {
        return false
      }
    })

    expect(finishMessages.length).toBe(1)
  })

  it('should remove finish_reason spanning across multiple chunks', async () => {
    const inputStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('{"foo":"bar"')
        controller.enqueue(',"finish_reason"')
        controller.enqueue(':null}')
        controller.close()
      }
    })

    const cleaner = new FinishReasonCleanerStream()
    const outputStream = inputStream.pipeThrough(cleaner)
    const result = await collectStream(outputStream)

    expect(result.length).toBe(2)
    expect(result.join('')).toBe('{"foo":"bar"}')
  })

  it('should handle chunks without finish_reason correctly', async () => {
    const inputStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('{"foo":"bar"}')
        controller.enqueue('{"baz":"qux"}')
        controller.close()
      }
    })

    const cleaner = new FinishReasonCleanerStream()
    const outputStream = inputStream.pipeThrough(cleaner)
    const result = await collectStream(outputStream)

    expect(result.join('')).toBe('{"foo":"bar"}{"baz":"qux"}')
  })

  it('should handle false alarms correctly', async () => {
    const inputStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('{"foo":"bar"')
        controller.enqueue(',"finish_reason":')
        controller.enqueue('nul')
        controller.enqueue('X}')
        controller.close()
      }
    })

    const cleaner = new FinishReasonCleanerStream()
    const outputStream = inputStream.pipeThrough(cleaner)
    const result = await collectStream(outputStream)

    expect(result.join('')).toBe('{"foo":"bar","finish_reason":nulX}')
  })
})