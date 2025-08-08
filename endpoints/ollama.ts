import consola from 'consola'
import { Context, Hono, Next } from 'hono'
import { BaseEndpointHandler } from './base'

export class OllamaHandler extends BaseEndpointHandler {
  async handle_api_tags(request: Request, ctx: Context, next: Next) {
    consola.info('handle_api_tags')
    const modifiedRequest = await this.hookRequest(request, ctx)
    const upstreams = this.upstreams.findAll({ protocol: this.settings.type, model: null })
    const results = await Promise.allSettled(
      upstreams.map(u => u.handle(modifiedRequest.clone(), ctx).then(r => r.json()))
    )

    const models = results.flatMap(r => (r.status === 'fulfilled' && Array.isArray(r.value?.models)) ? r.value.models : [])
    const seenNames = new Set<string>()
    const deduped = models.filter(m => {
      const name = (m && typeof (m as any).name === 'string') ? (m as any).name as string : undefined
      if (!name) return false
      if (seenNames.has(name)) return false
      seenNames.add(name)
      return true
    })

    const response = ctx.json({ models: deduped })
    return await this.hookResponse(response, modifiedRequest, ctx)
  }

  async handle_api_show(request: Request, ctx: Context, next: Next) {
    consola.info('handle_api_show')
    const modifiedRequest = await this.hookRequest(request, ctx)
    const response = ctx.json({
      model_info: { 'general.architecture': 'CausalLM' },
      capabilities: ['chat', 'tools', 'stop', 'reasoning']
    })
    return await this.hookResponse(response, modifiedRequest, ctx)
  }

  setupEndpointRoutes(app: Hono): void {
    app.get(`${this.settings.prefix}/api/tags`, this.action(this.handle_api_tags))
    app.post(`${this.settings.prefix}/api/show`, this.action(this.handle_api_show))
    app.all(`${this.settings.prefix}/*`, this.action(this.handle_remaining_routes))
  }
}