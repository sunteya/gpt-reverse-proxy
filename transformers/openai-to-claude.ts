import { Context } from 'hono'
import { Hook } from '../lib/Hook'
import * as protocols from '../protocols'

class OpenaiToClaudeHook extends Hook {
  name = 'openai-to-claude'

  isChatCompletionsRequest(request: Request): boolean {
    return request.method === 'POST' && request.url.includes('/v1/chat/completions')
  }

  async on_chat_completions_request(request: Request, ctx: Context) {
    const json = await request.clone().json()
    const newJson = protocols.completionOpenAIToClaude(json)

    return new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(newJson)
    })
  }

  async on_chat_completions_response(response: Response, request: Request, ctx: Context) {
    return response
  }

  async onRequest(request: Request, ctx: Context) {
    if (this.isChatCompletionsRequest(request)) {
      return await this.on_chat_completions_request(request, ctx)
    }

    return request
  }

  async onResponse(response: Response, request: Request, ctx: Context): Promise<Response> {
    if (this.isChatCompletionsRequest(request)) {
      return await this.on_chat_completions_response(response, request, ctx)
    }

    return response
  }

  // handleChatCompletions(response: Response, request: Request, ctx: Context) {
  //   if (!this.isStreamingResponse(response)) {
  //     return response
  //   }
  //
  //   const originalStream = response.body
  //   if (!originalStream) {
  //     return response
  //   }

  //   const eventStream = originalStream.pipeThrough(new TextDecoderStream())
  //                                     .pipeThrough(new EventSourceParserStream())
  //                                     .pipeThrough(new DumpEventSourceStream('upstream', ctx.get('dumper')))
  //                                     .pipeThrough(this.createFinishReasonCleanerStream())
  //                                     .pipeThrough(new DumpEventSourceStream('converted', ctx.get('dumper')))
  //                                     .pipeThrough(new EventSourceEncoderStream())
  //                                     .pipeThrough(new TextEncoderStream())

  //   return new Response(eventStream, {
  //     status: response.status,
  //     statusText: response.statusText,
  //     headers: response.headers
  //   })
  // }

  // async onResponse(response: Response, request: Request, ctx: Context): Promise<Response> {
  //   if (request.url.includes('/v1/chat/completions')) {
  //     return this.handleChatCompletions(response, request, ctx)
  //   }

  //   return response
  // }

  // createFinishReasonCleanerStream(): TransformStream<EventSourceMessage, EventSourceMessage> {
  //   return new TransformStream({
  //     transform: (source, controller) => {
  //       if (source.data === '[DONE]') {
  //         controller.enqueue(source)
  //         return
  //       }

  //       const json = this.parseObject(source.data)
  //       if (!json) {
  //         controller.enqueue(source)
  //         return
  //       }

  //       const choices = json.choices
  //       if (Array.isArray(json.choices)) {
  //         for (const choice of choices) {
  //           if (choice.finish_reason === null) {
  //             delete choice.finish_reason
  //           }
  //         }
  //       }

  //       controller.enqueue({ ...source, data: JSON.stringify(json) })
  //     }
  //   })
  // }
}

export default new OpenaiToClaudeHook()