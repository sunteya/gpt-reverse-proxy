import { Hono } from 'hono'
import { Context, Next } from 'hono'
import { Upstream } from '../proxy/proxy'
import { EndpointHandler, EndpointSettings } from './types'
import { UpstreamRegistry } from '../lib/UpstreamRegistry'
import * as utils from '../lib/utils'
import { UpstreamNotFoundError } from '../lib/errors'
import consola from 'consola'
import { HookRegistry } from '../lib/HookRegistry'

export abstract class BaseEndpointHandler implements EndpointHandler {
  settings: EndpointSettings
  upstreams: UpstreamRegistry
  hooks: HookRegistry

  constructor(settings: EndpointSettings, upstreams: UpstreamRegistry, hooks: HookRegistry) {
    this.settings = settings
    this.upstreams = upstreams
    this.hooks = hooks
  }

  async hookRequest(request: Request, ctx: Context): Promise<Request> {
    const hooks = this.hooks.getHooks(this.settings.hooks ?? [])
    
    let modifiedRequest = request
    for (const hook of hooks) {
      modifiedRequest = await hook.onRequest(modifiedRequest, ctx)
    }

    return modifiedRequest
  }

  protected async hookResponse(response: Response, request: Request, ctx: Context): Promise<Response> {
    const hooks = this.hooks.getHooks(this.settings.hooks ?? [])

    let modifiedResponse = response
    for (const hook of hooks) {
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

  async handleProxyRequest(ctx: Context, next: Next, upstream: Upstream) {
    const request = this.buildStrippedRequest(ctx)
    const modifiedRequest = await this.hookRequest(request, ctx)

    const response = await upstream.handle(modifiedRequest, ctx)

    return await this.hookResponse(response, modifiedRequest, ctx)
  }

  action(callback: (c: Context, next: Next) => Promise<Response>) {
    return async (c: Context, next: Next) => {
      try {
        return await callback.call(this, c, next)
      } catch (error) {
        consola.error(error)

        if (error instanceof UpstreamNotFoundError) {
          return c.text(error.message, 503)
        }

        return c.text('Internal Server Error', 500)
      }
    }
  }

  async handle_remaining_routes(c: Context, next: Next) {
    const upstream = this.upstreams.find({ group: this.settings.group, model: null })
    return this.handleProxyRequest(c, next, upstream)
  }

  abstract setupEndpointRoutes(app: Hono): void
}
