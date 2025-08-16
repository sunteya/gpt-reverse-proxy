import { MessageCreateParamsBase as ClaudeCompletionParams, TextBlockParam as ClaudeTextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import consola from 'consola'
import { Hono } from 'hono'
import { BaseEndpointHandler } from './base'
import { EndpointEnv } from '../lib/EndpointEnv'
import { CLAUDE_MESSAGES_PATH } from '../protocols'

export class ClaudeHandler extends BaseEndpointHandler {
  async handle_messages(request: Request, env: EndpointEnv) {
    const req = request.clone()
    const json = await req.json()
    const model = String(json?.model)
    const candidates = this.upstreams.findAll({ protocol: this.settings.type, model })
    return this.balancer.forward(candidates, request, env)
  }

  setupEndpointRoutes(app: Hono): void {
    const routers = new Hono()
    routers.post(CLAUDE_MESSAGES_PATH, this.action(this.handle_messages))
    routers.all('*', this.action(this.handle_remaining_routes))
    app.route(this.settings.prefix || '', routers)
  }
}