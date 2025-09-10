import { ChatCompletionCreateParamsBase } from 'openai/resources/chat/completions'
import { EndpointEnv } from '../lib/EndpointEnv'
import { Hook, HookRequestContext } from '../lib/Hook'
import { OPENAI_CHAT_COMPLETIONS_PATH } from '../protocols'
import { ReasoningToThinkTagStream } from './cursor-compatible/ReasoningToThinkTagStream'
import { minimatch } from 'minimatch'
import _ from 'lodash'

class ReasoningToThinkHook extends Hook<string[]> {
  name = 'reasoning-to-think'

  constructor(config: string[] | undefined) {
    super(config ?? [])
  }

  async onRequest(request: Request, env: EndpointEnv, ctx: HookRequestContext) {
    if (request.method === 'POST' && request.url.includes(OPENAI_CHAT_COMPLETIONS_PATH)) {
      return this.onOpenaiChatCompletionsRequest(request, env, ctx)
    }

    return request
  }

  async onOpenaiChatCompletionsRequest(request: Request, env: EndpointEnv, ctx: HookRequestContext) {
    const body = await request.clone().json()

    if (this.isModelMatched(body.model)) {
      this.convertThinkTag(request, ctx)

      const headers = new Headers(request.headers)
      headers.delete('content-length')
      const newBody = this.cleanThinkTag(body)

      return new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify(newBody),
      })
    }

    return request
  }

  isModelMatched(model: string | null | undefined) {
    if (!this.config.length) {
      return true
    }

    if (!model) {
      return false
    }

    return this.config.some(pattern => minimatch(model, pattern))
  }

  cleanThinkTag(body: ChatCompletionCreateParamsBase): ChatCompletionCreateParamsBase {
    const newBody = _.cloneDeep(body)
    for (const message of newBody.messages) {
      if (typeof message.content === 'string' && message.content.startsWith("<think>")) {
        const index = message.content.indexOf("</think>")
        message.content = message.content.substring(index + "</think>".length)
      }
    }
    return newBody
  }

  convertThinkTag(request: Request, ctx: HookRequestContext) {
    ctx.addResponse((resp) => {
      if (this.isStreamingResponse(resp)) {
        return this.convert_stream_chunk_response(resp, (stream) => stream.pipeThrough(new ReasoningToThinkTagStream()))
      } else {
        return resp
      }
    })

    return request
  }
}

export default ReasoningToThinkHook
