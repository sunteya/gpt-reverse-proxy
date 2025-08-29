import { describe, it, expect, vi } from 'vitest'
import { OPENAI_CHAT_COMPLETIONS_PATH } from '$$/protocols'
import CursorCompatibleHook from '$$/patches/cursor-compatible'

describe('CursorCompatibleHook', () => {
  const cursorCompatibleHook = new CursorCompatibleHook({})
  describe('onRequest', () => {
    it('should modify request for cursor compatibility', async () => {
      const originalBody = {
        model: 'gpt-5',
        temperature: 0,
        max_tokens: 100,
        stream: false,
      }
      const requestUrl = `https://api.openai.com${OPENAI_CHAT_COMPLETIONS_PATH}`
      const originalRequest = new Request(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(originalBody),
      })

      const env = {}
      const ctx = {
        addResponse: vi.fn(),
      }

      // @ts-ignore
      const newRequest = await cursorCompatibleHook.onRequest(originalRequest, env, ctx)

      expect(newRequest).not.toBe(originalRequest)
      const newBody = await newRequest.json()

      expect(newBody.temperature).toBe(1)

      expect(newBody.max_tokens).toBeUndefined()
      expect(newBody.max_completion_tokens).toBe(originalBody.max_tokens)
    })

    it('should not modify body if conditions are not met on completions path', async () => {
      const originalBody = {
        model: 'gpt-4',
        temperature: 0.5,
      }
      const requestUrl = `https://api.openai.com${OPENAI_CHAT_COMPLETIONS_PATH}`
      const originalRequest = new Request(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(originalBody),
      })

      const env = {}
      const ctx = {
        addResponse: vi.fn(),
      }

      // @ts-ignore
      const newRequest = await cursorCompatibleHook.onRequest(originalRequest, env, ctx)

      // Request object is still new due to header modifications
      expect(newRequest).not.toBe(originalRequest)

      const newBody = await newRequest.json()
      // Body content should not be changed
      expect(newBody).toEqual(originalBody)
    })
  })
})