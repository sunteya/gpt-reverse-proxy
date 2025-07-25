import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { stripPrefix } from './utils'
import consola from 'consola'

function handleTags(upstream: MiddlewareHandler) {
  return async (c: Context) => {
    c.set('rewrite_path', '/v1/models')
    const response = await upstream(c, async () => { })

    if (!response) {
      return c.text('Proxy middleware failed to return a response.', 500)
    }

    if (response.status !== 200) {
      return response // Pass through the upstream error
    }

    try {
      const openAIResponse = await response.json() as { data: { id: string }[] }
      if (!openAIResponse.data) {
        return c.json({ models: [] })
      }
      const models = openAIResponse.data.map(m => ({ name: m.id, model: m.id }))
      return c.json({ models })
    } catch (e: any) {
      return new Response(`Failed to parse upstream response: ${e.message}`, { status: 500 })
    }
  }
}

function handleShow() {
  return async (c: Context) => {
    return c.json({
      model_info: { 'general.architecture': 'CausalLM' },
      capabilities: ['chat', 'tools', 'stop', 'reasoning'],
    })
  }
}

export function registerOllamaRoutes(root: Hono, upstream: MiddlewareHandler, secret: string | null) {
  const mountPath = '/' + (secret || 'ollama').replace(/^\//, '')
  const routes = new Hono()

  // Restore special handlers
  routes.get('/api/tags', handleTags(upstream))
  routes.all('/api/show', handleShow())

  // /v1/chat/completions
  routes.all('*', (c, next) => {
    const path = c.get("rewrite_path") ?? c.req.path
    const strippedPath = stripPrefix(path, mountPath)
    c.set('rewrite_path', strippedPath)
    return upstream(c, next)
  })

  root.route(mountPath, routes)
}
