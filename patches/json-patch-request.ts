import { Hook, HookRequestContext } from '../lib/Hook'
import { EndpointEnv } from '../lib/EndpointEnv'
import { immutableJSONPatch, type JSONPatchDocument } from 'immutable-json-patch'

class JsonPatchRequestHook extends Hook<Record<string, JSONPatchDocument>> {
  name = 'json-patch-request'

  async onRequest(request: Request, env: EndpointEnv, ctx: HookRequestContext) {
    if (!request.headers.get('content-type')?.includes('application/json')) {
      return request
    }

    const config = this.config

    try {
      let document = await request.clone().json()

      for (const key in config) {
        const operations = config[key]
        try {
          document = immutableJSONPatch(document, operations)
        } catch (error) {
          if (error instanceof Error && error.message.includes('Test failed')) {
            continue
          }

          throw error
        }
      }

      const headers = new Headers(request.headers)
      headers.delete('content-length')

      return new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify(document),
      })
    } catch (error) {
      console.error(`[${this.name}] Failed to process request for json-patch:`, error)
      return request
    }
  }
}

export default JsonPatchRequestHook
