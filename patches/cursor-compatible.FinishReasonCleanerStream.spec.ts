import { describe, it, expect } from 'vitest'
import { FinishReasonCleanerStream } from './cursor-compatible'

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
        controller.enqueue(',"finish_reason":') // Interception trigger
        controller.enqueue('nul')              // Partial, but not 'null'
        controller.enqueue('X}')                // Mismatch
        controller.close()
      }
    })

    const cleaner = new FinishReasonCleanerStream()
    const outputStream = inputStream.pipeThrough(cleaner)
    const result = await collectStream(outputStream)

    expect(result.join('')).toBe('{"foo":"bar","finish_reason":nulX}')
  })
})