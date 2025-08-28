import { describe, it, expect, vi } from 'vitest'
import { OPENAI_CHAT_COMPLETIONS_PATH } from '../protocols'
import cursorCompatibleHook from './cursor-compatible'

describe('CursorCompatibleHook', () => {
  describe('onRequest', () => {
    it('should modify request for cursor compatibility', async () => {
      // 准备请求数据
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

      const env = {} // 模拟 EndpointEnv
      const ctx = {
        addResponse: vi.fn(),
      } // 模拟 HookRequestContext

      // @ts-ignore
      const newRequest = await cursorCompatibleHook.onRequest(originalRequest, env, ctx)

      // 验证请求已被修改
      expect(newRequest).not.toBe(originalRequest)
      const newBody = await newRequest.json()

      // 1. temperature 应该从 0 变为 1
      expect(newBody.temperature).toBe(1)

      // 2. model 为 gpt-5 时, max_tokens 应该被替换为 max_completion_tokens
      expect(newBody.max_tokens).toBeUndefined()
      expect(newBody.max_completion_tokens).toBe(originalBody.max_tokens)

      // 您可以在这里添加更多关于 header 和 stream response 的测试
    })

    it('should not modify body if conditions are not met on completions path', async () => {
      const originalBody = {
        model: 'gpt-4', // not gpt-5
        temperature: 0.5, // not 0
      }
      const requestUrl = `https://api.openai.com${OPENAI_CHAT_COMPLETIONS_PATH}`
      const originalRequest = new Request(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(originalBody),
      })

      const env = {} // 模拟 EndpointEnv
      const ctx = {
        addResponse: vi.fn(),
      } // 模拟 HookRequestContext

      // @ts-ignore
      const newRequest = await cursorCompatibleHook.onRequest(originalRequest, env, ctx)

      // Request object is still new due to header modifications
      expect(newRequest).not.toBe(originalRequest)

      const newBody = await newRequest.json()
      // Body content should not be changed
      expect(newBody).toEqual(originalBody)
    })

    // 在这里添加更多测试用例, 比如测试流式响应的处理
  })
})