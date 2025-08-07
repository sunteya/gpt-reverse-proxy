import { MessageCreateParamsBase as ClaudeCompletionParams, TextBlockParam as ClaudeTextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import consola from 'consola'
import { Context, Hono, Next } from 'hono'
import { BaseEndpointHandler } from './base'

export class ClaudeHandler extends BaseEndpointHandler {
  async handle_messages(request: Request, ctx: Context, next: Next) {
    consola.info(`handle_chat_completions`)
    const req = ctx.req.raw.clone()
    const json = await req.json()
    const model = String(json?.model)
    const upstream = this.upstreams.find({ model, protocol: this.settings.type })

    return this.handleProxyRequest(request, ctx, next, upstream)
  }

  setupEndpointRoutes(app: Hono): void {
    app.post(`${this.settings.prefix}/v1/messages`, this.action(this.handle_messages))
    app.all(`${this.settings.prefix}/*`, this.action(this.handle_remaining_routes))
  }
}