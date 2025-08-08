import { Context } from 'hono'
import { Hook } from '../lib/Hook'
import * as protocols from '../protocols'

class OllamaToOpenAIHook extends Hook {
  name = 'ollama-to-openai'

  isTagsRequest(request: Request): boolean {
    return request.method === 'GET' && request.url.includes('/api/tags')
  }

  async on_tags_request(request: Request, ctx: Context) {
    const url = new URL(request.url)
    url.pathname = url.pathname.replace('/api/tags', '/v1/models')
    return new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
    })
  }

  async on_tags_response(response: Response, request: Request, ctx: Context) {
    if (response.status !== 200) {
      return response
    }

    const json = await response.json()
    const newJson = protocols.openaiModelsResponseToOllama(json)
    return new Response(JSON.stringify(newJson), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }

  async onRequest(request: Request, ctx: Context) {
    if (this.isTagsRequest(request)) {
      return this.on_tags_request(request, ctx)
    }

    return request
  }

  async onResponse(response: Response, request: Request, ctx: Context): Promise<Response> {
    if (this.isTagsRequest(request)) {
      return this.on_tags_response(response, request, ctx)
    }

    return response
  }
}

export default new OllamaToOpenAIHook()


