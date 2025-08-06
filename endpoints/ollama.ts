import { Hono, Context, Next } from 'hono'
import { BaseEndpointHandler } from './base'
import { EndpointSettings, UpstreamGetter } from './types'
import consola from 'consola'

export class OllamaHandler extends BaseEndpointHandler {
  constructor(settings: EndpointSettings, upstreamGetter: UpstreamGetter) {
    super(settings, upstreamGetter)
  }

  setupEndpointRoutes(app: Hono): void {
    // Custom route: handle /models endpoint locally
    app.get(`${this.settings.prefix}/api/tags`, async (c: Context) => {
      consola.info(`Handling local ${this.settings.prefix}/api/tags request (group: ${this.settings.group})`)
      
      // Example: return local model list
      return c.json({
        models: [
          {
            name: "llama2:latest",
            size: 3826793677,
            digest: "sha256:bc07c81de745696fdf5afca05e065818a8149fb0c77266fb584d5b2bb96e9d1a",
            modified_at: "2023-12-07T09:32:18.757212583Z"
          }
        ]
      })
    })

    // Custom route: handle version endpoint locally
    app.get(`${this.settings.prefix}/api/version`, async (c: Context) => {
      consola.info(`Handling local ${this.settings.prefix}/api/version request (group: ${this.settings.group})`)
      
      return c.json({
        version: "0.1.0"
      })
    })

    // Default: proxy all other requests to upstream through internal method
    app.all(`${this.settings.prefix}/*`, async (c: Context, next: Next) => {
      return this.handleProxyRequest(c, next)
    })
  }
}