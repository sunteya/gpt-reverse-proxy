import { describe, it, expect } from 'vitest'
import { FinishReasonCleanerStream } from '$$/patches/cursor-compatible'
import { collectStream } from '$$/spec/support/test-helpers'

describe('FinishReasonCleanerStream', () => {
  it('should remove finish_reason:null with leading space', async () => {
    const inputStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":')
        controller.enqueue(' null,"index":0}]}\n\n')
        controller.enqueue('data: [DONE]\n\n')
        controller.close()
      }
    })

    const subject = new FinishReasonCleanerStream()
    const outputChunks = await collectStream(
      inputStream.pipeThrough(subject)
    )

    const result = outputChunks.join('')
    expect(result).not.toContain('finish_reason')
    expect(result).toContain('data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n')
  })
})