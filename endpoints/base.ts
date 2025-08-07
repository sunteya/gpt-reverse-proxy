import { Hono } from 'hono'
import { Context, Next } from 'hono'
import { Upstream } from '../lib/Upstream'
import { EndpointHandler, EndpointSettings } from './types'
import { UpstreamRegistry } from '../lib/UpstreamRegistry'
import * as utils from '../lib/utils'
import { UpstreamNotFoundError } from '../lib/errors'
import consola from 'consola'
import { HookRegistry } from '../lib/HookRegistry'
import { Hook } from '../lib/Hook'

export abstract class BaseEndpointHandler implements EndpointHandler {
  settings: EndpointSettings
  upstreams: UpstreamRegistry
  hooks: Hook[]

  constructor(settings: EndpointSettings, upstreams: UpstreamRegistry, hookRegistry: HookRegistry) {
    this.settings = settings
    this.upstreams = upstreams

    this.hooks = hookRegistry.getHooks(settings.plugins ?? [])
  }

  async hookRequest(request: Request, ctx: Context): Promise<Request> {
    let modifiedRequest = request
    for (const hook of this.hooks) {
      modifiedRequest = await hook.onRequest(modifiedRequest, ctx)
    }

    return modifiedRequest
  }

  async hookResponse(response: Response, request: Request, ctx: Context): Promise<Response> {
    let modifiedResponse = response
    for (const hook of this.hooks.reverse()) {
      modifiedResponse = await hook.onResponse(modifiedResponse, request, ctx)
    }
    
    return modifiedResponse
  }

  buildStrippedRequest(ctx: Context): Request {
    if (!this.settings.prefix) {
      return ctx.req.raw.clone()
    }

    const strippedPath = utils.stripPrefix(ctx.req.path, this.settings.prefix)
    const originalRequest = ctx.req.raw.clone()
    const originalUrl = new URL(originalRequest.url)
    
    const modifiedUrl = new URL(strippedPath + originalUrl.search, originalUrl.origin)

    return new Request(modifiedUrl.toString(), {
      method: originalRequest.method,
      headers: originalRequest.headers,
      body: originalRequest.body
    })
  }

  async handleProxyRequest(request: Request, ctx: Context, next: Next, upstream: Upstream) {
    const modifiedRequest = await this.hookRequest(request, ctx)
    const response = await upstream.handle(modifiedRequest, ctx)
    return await this.hookResponse(response, modifiedRequest, ctx)
  }

  action(callback: (request: Request, ctx: Context, next: Next) => Promise<Response>) {
    return async (c: Context, next: Next) => {
      try {
        const request = this.buildStrippedRequest(c)
        return await callback.call(this, request, c, next)
      } catch (error) {
        consola.error(error)

        if (error instanceof UpstreamNotFoundError) {
          return c.text(error.message, 503)
        }

        return c.text('Internal Server Error', 500)
      }
    }
  }

  async handle_remaining_routes(request: Request, ctx: Context, next: Next) {
    const upstream = this.upstreams.find({ protocol: this.settings.type, model: null })
    return this.handleProxyRequest(request, ctx, next, upstream)
  }

  abstract setupEndpointRoutes(app: Hono): void
}
