import { Context, Hono, Next } from 'hono'
import { BaseEndpointHandler } from './base'
import { EndpointSettings } from './types'
import { UpstreamRegistry } from '../lib/UpstreamRegistry'
import consola from 'consola'

export class OpenAIHandler extends BaseEndpointHandler {
  async handle_chat_completions(c: Context, next: Next) {
    consola.info(`handle_chat_completions`)
    const req = c.req.raw.clone()
    const json = await req.json()
    const model = String(json?.model)
    const upstream = this.upstreams.find({ group: this.settings.group, model, protocol: 'openai' })
    return this.handleProxyRequest(c, next, upstream)
  }

  setupEndpointRoutes(app: Hono): void {
    app.post(`${this.settings.prefix}/v1/chat/completions`, this.action(this.handle_chat_completions))
    app.all(`${this.settings.prefix}/*`, this.action(this.handle_remaining_routes))
  }
}
