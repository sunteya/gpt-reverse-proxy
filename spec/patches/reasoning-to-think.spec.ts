import ReasoningToThinkHook from '$$/patches/reasoning-to-think'
import { loadChunksFromLogFile } from '$$/spec/support/test-helpers'
import { ChatCompletionCreateParamsBase } from 'openai/resources/chat/completions'
import path from 'path'
import { describe, expect, it } from 'vitest'

describe('reasoning-to-think', () => {
 it('should output valid usage', async () => {
    const subject = new ReasoningToThinkHook([])
    const entries = await loadChunksFromLogFile(path.join(__dirname, "reasoning-to-think.20250910005900633.jsonl"))
    const event = entries.find(it => it.leg == 'user' && it.direction == 'request' && it.event == 'body')!
    const body = event.payload as ChatCompletionCreateParamsBase

    expect(body.messages[3].content).toContain("<think>")

    const result = subject.cleanThinkTag(body)
    expect(result.messages[3].content).not.toContain("</think>")
  })
})