import { Hono } from 'hono'
import { Context, Next } from 'hono'
import { proxy } from '../proxy/proxy'
import { EndpointHandler, EndpointSettings, UpstreamGetter } from './types'
import * as utils from '../lib/utils'
import { hookRegistry } from '../lib/hookRegistry'

export abstract class BaseEndpointHandler implements EndpointHandler {
  protected settings: EndpointSettings
  protected upstreamGetter: UpstreamGetter

  constructor(settings: EndpointSettings, upstreamGetter: UpstreamGetter) {
    this.settings = settings
    this.upstreamGetter = upstreamGetter
  }

  async hookRequest(request: Request): Promise<Request> {
    const hooks = hookRegistry.getHooks(this.settings.hooks ?? [])
    
    let modifiedRequest = request
    for (const hook of hooks) {
      modifiedRequest = await hook.onRequest(modifiedRequest)
    }

    return modifiedRequest
  }

  protected async hookResponse(response: Response, request: Request): Promise<Response> {
    const hooks = hookRegistry.getHooks(this.settings.hooks ?? [])

    let modifiedResponse = response
    for (const hook of hooks) {
      modifiedResponse = await hook.onResponse(modifiedResponse, request)
    }
    
    return modifiedResponse
  }

  buildStrippedRequest(c: Context): Request {
    if (!this.settings.prefix) {
      return c.req.raw.clone()
    }

    const strippedPath = utils.stripPrefix(c.req.path, this.settings.prefix)
    const originalRequest = c.req.raw.clone()
    const originalUrl = new URL(originalRequest.url)
    
    const modifiedUrl = new URL(strippedPath + originalUrl.search, originalUrl.origin)

    return new Request(modifiedUrl.toString(), {
      method: originalRequest.method,
      headers: originalRequest.headers,
      body: originalRequest.body
    })
  }


  async handleProxyRequest(c: Context, next: Next) {
    const upstream = this.upstreamGetter(this.settings.group)
    if (!upstream) {
      return c.text('No upstream available', 503)
    }

    const request = this.buildStrippedRequest(c)
    const modifiedRequest = await this.hookRequest(request)

    const response = await proxy(modifiedRequest, {
      upstream_url: upstream.api_base,
      upstream_key: upstream.api_key,
      https_proxy: process.env.https_proxy,
    })

    return await this.hookResponse(response, modifiedRequest)
  }

  protected getUpstreamProxy() {
    return async (c: Context, next: Next) => {
      return this.handleProxyRequest(c, next)
    }
  }

  abstract setupEndpointRoutes(app: Hono): void
}