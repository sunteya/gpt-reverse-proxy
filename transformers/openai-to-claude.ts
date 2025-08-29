import { EventSourceParserStream } from 'eventsource-parser/stream'
import { EndpointEnv } from '../lib/EndpointEnv'
import { EventSourceEncoderStream } from '../lib/EventSourceEncoderStream'
import { Hook, HookRequestContext } from '../lib/Hook'
import * as protocols from '../protocols'
import { EventSourceMessage } from 'eventsource-parser'
import { OPENAI_CHAT_COMPLETIONS_PATH } from '../protocols'
import { CLAUDE_MESSAGES_PATH } from '../protocols'

class OpenaiToClaudeHook extends Hook {
  name = 'openai-to-claude'

  async on_chat_completions_request(request: Request, env: EndpointEnv, ctx: HookRequestContext) {
    ctx.addResponse((res) => {
      if (this.isStreamingResponse(res)) {
        return this.convert_stream_event_response(res, new protocols.ClaudeToOpenAIStream())
      } else {
        return this.convert_json_response(res, protocols.claudeMessageResponseToOpenAI)
      }
    })

    const json = await request.clone().json()
    const newJson = protocols.openaiCompletionRequestToClaude(json)

    const newUrl = request.url.replace(OPENAI_CHAT_COMPLETIONS_PATH, CLAUDE_MESSAGES_PATH)

    return new Request(newUrl, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(newJson)
    })
  }

  async onRequest(request: Request, env: EndpointEnv, ctx: HookRequestContext) {
    if (request.method === 'POST' && request.url.includes(OPENAI_CHAT_COMPLETIONS_PATH)) {
      return this.on_chat_completions_request(request, env, ctx)
    }

    return request
  }
}

export default OpenaiToClaudeHook