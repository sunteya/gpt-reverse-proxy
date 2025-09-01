import consola from 'consola'
import { Hono } from 'hono'
import { BaseEndpointHandler } from './base'
import { EndpointEnv } from '../lib/EndpointEnv'
import { OPENAI_CHAT_COMPLETIONS_PATH } from '../protocols'

export class OllamaHandler extends BaseEndpointHandler {
  async handle_api_tags(request: Request, env: EndpointEnv) {
    const upstreams = this.upstreams.findAll({
      protocol: this.settings.type,
      model: null,
      group: this.settings.group,
    })
    const results = await Promise.allSettled(
      upstreams.map(u => u.handle(request.clone(), env, this.hooks).then(r => r.json()))
    )

    const models = results.flatMap(r => (r.status === 'fulfilled' && Array.isArray(r.value?.models)) ? r.value.models : [])
    const seenNames = new Set<string>()
    const deduped = models.filter(m => {
      const id = m.name
      if (!id) return false
      if (seenNames.has(id)) return false
      seenNames.add(id)
      return true
    })

    return new Response(JSON.stringify({ models: deduped }), {
      headers: { 'content-type': 'application/json' }
    })
  }

  async handle_api_show(request: Request, env: EndpointEnv) {
    return new Response(JSON.stringify({
      model_info: { 'general.architecture': 'CausalLM' },
      capabilities: ['chat', 'tools', 'stop', 'reasoning']
    }), {
      headers: { 'content-type': 'application/json' }
    })
  }

  async handle_api_version(request: Request, env: EndpointEnv) {
    return new Response(JSON.stringify({
      version: '0.8.0'
    }), {
      headers: { 'content-type': 'application/json' }
    })
  }

  async handle_chat_completions(request: Request, env: EndpointEnv) {
    const req = request.clone()
    const json = await req.json()
    const model = String(json?.model)
    const candidates = this.upstreams.findAll({
      protocol: this.settings.type,
      model,
      group: this.settings.group,
    })
    return this.balancer.forward(candidates, request, env)
  }

  setupEndpointRoutes(app: Hono): void {
    const routers = new Hono()
    routers.get('/api/tags', this.action(this.handle_api_tags))
    routers.post('/api/show', this.action(this.handle_api_show))
    routers.get('/api/version', this.action(this.handle_api_version))
    routers.post(OPENAI_CHAT_COMPLETIONS_PATH, this.action(this.handle_chat_completions))
    routers.all('*', this.action(this.handle_remaining_routes))
    app.route(this.settings.prefix || '', routers)
  }
}