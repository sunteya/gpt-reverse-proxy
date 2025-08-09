import { Hook, HookRequestContext } from '../lib/Hook'
import { EndpointEnv } from '../lib/EndpointEnv'
import * as protocols from '../protocols'

class OllamaToOpenAIHook extends Hook {
  name = 'ollama-to-openai'

  async on_tags_request(request: Request, env: EndpointEnv, ctx: HookRequestContext) {
    ctx.addResponse((res) => this.convert_json_response(res, protocols.openaiModelsResponseToOllama))

    const url = new URL(request.url)
    url.pathname = url.pathname.replace('/api/tags', '/v1/models')

    return new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
    })
  }

  async onRequest(request: Request, env: EndpointEnv, ctx: HookRequestContext) {
    if (request.method === 'GET' && request.url.includes('/api/tags')) {
      return this.on_tags_request(request, env, ctx)
    }

    return request
  }
}

export default new OllamaToOpenAIHook()


