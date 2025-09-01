import { describe, it, expect } from 'vitest'
import { ClaudeToOpenAIStream } from '$$/protocols/completion-openai-to-claude'
import { loadChunksFromLogFile, collectStream } from '$$/spec/support/test-helpers'
import { createParser, EventSourceMessage } from 'eventsource-parser'
import { EventSourceParserStream } from 'eventsource-parser/stream'
import path from 'path'

describe('ClaudeToOpenAIStream', () => {
  it('should correctly convert tool call', async () => {
    const inputEntries = await loadChunksFromLogFile(path.join(__dirname, "ClaudeToOpenAIStream.20250829141539904.jsonl"))
    const inputStream = new ReadableStream<string>({
      start(controller) {
        inputEntries
          .filter(it => it.leg == 'upstream' && it.direction == 'response' && it.event == 'chunk')
          .forEach(it => controller.enqueue(it.payload.text + "\n\n"))
        controller.close()
      }
    })

    const subject = new ClaudeToOpenAIStream()
    const outputEvents = await collectStream(
      inputStream.pipeThrough(new EventSourceParserStream())
                 .pipeThrough(subject)
    )

    const messages = outputEvents.map(it => it.data)

    expect(messages.at(-1)).toBe("[DONE]")

    const toolCallMessage = JSON.parse(messages.at(-2)!)
    expect(toolCallMessage.choices[0].delta.tool_calls).toHaveLength(1)
  })
})
