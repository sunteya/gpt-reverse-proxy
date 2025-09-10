import _ from 'lodash'
import { EndpointEnv } from '../lib/EndpointEnv'
import { Hook, HookRequestContext } from '../lib/Hook'
import { OPENAI_CHAT_COMPLETIONS_PATH } from '../protocols'
import { CombineFinishChunkStream } from './cursor-compatible/CombineFinishChunkStream'
import { FinishReasonCleanerStream } from './cursor-compatible/FinishReasonCleanerStream'

class CursorCompatibleHook extends Hook {
  name = 'cursor-compatible'

  async onRequest(request: Request, env: EndpointEnv, ctx: HookRequestContext) {
    if (request.method === 'POST' && request.url.includes(OPENAI_CHAT_COMPLETIONS_PATH)) {
      ctx.addResponse((resp) => {
        return this.isStreamingResponse(resp) ? this.convert_stream_chunk_response(resp, (stream) => {
          return stream
            .pipeThrough(new FinishReasonCleanerStream())
            .pipeThrough(new CombineFinishChunkStream())
        }) : resp
      })

      const body = await request.clone().json()
      if (body.model == "gpt-5") {
        body.max_completion_tokens = body.max_tokens
        body.temperature = 1
        delete body.max_tokens
      }

      const headers = new Headers(request.headers)
      headers.delete('content-length')

      return new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify(body)
      })
    }

    return request
  }
}

export default CursorCompatibleHook
