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
import { EndpointEnv } from '../lib/EndpointEnv'
import { Dumper, dumpRequest, dumpResponse, generateDumpFilePath } from '../lib/Dumper'

export abstract class BaseEndpointHandler implements EndpointHandler {
  settings: EndpointSettings
  upstreams: UpstreamRegistry
  hooks: Hook[]

  constructor(settings: EndpointSettings, upstreams: UpstreamRegistry, hookRegistry: HookRegistry) {
    this.settings = settings
    this.upstreams = upstreams

    this.hooks = hookRegistry.getHooks(settings.plugins ?? [])
  }

  buildStrippedRequest(rawRequest: Request): Request {
    if (!this.settings.prefix) {
      return rawRequest.clone()
    }

    const originalUrl = new URL(rawRequest.url)
    const strippedPath = utils.stripPrefix(originalUrl.pathname, this.settings.prefix)
    const modifiedUrl = new URL(strippedPath + originalUrl.search, originalUrl.origin)

    const originalRequest = rawRequest.clone()
    return new Request(modifiedUrl.toString(), {
      method: originalRequest.method,
      headers: originalRequest.headers,
      body: originalRequest.body
    })
  }

  action(callback: (request: Request, env: EndpointEnv) => Promise<Response>) {
    return async (ctx: Context) => {
      const dumpFilePath = generateDumpFilePath(ctx.req.path)
      consola.info(`Dumping to ${dumpFilePath}`)
      const dumper = new Dumper(dumpFilePath)

      try {
        const rawRequest = dumpRequest(dumper, 'user', ctx.req.raw)
        const request = this.buildStrippedRequest(rawRequest)

        const env = {
          dumper,
          originalRequest: request,
          prefix: this.settings.prefix
        } satisfies EndpointEnv

        const response = await callback.call(this, request, env)
        return dumpResponse(dumper, 'user', response)
      } catch (error) {
        consola.error(error)

        if (error instanceof UpstreamNotFoundError) {
          return dumpResponse(dumper, 'user', new Response(error.message, { status: 503 }))
        }

        return dumpResponse(dumper, 'user', new Response('Internal Server Error', { status: 500 }))
      }
    }
  }

  async handle_remaining_routes(request: Request, env: EndpointEnv) {
    const upstream = this.upstreams.find({ protocol: this.settings.type, model: null })
    return upstream.handle(request, env, this.hooks)
  }

  abstract setupEndpointRoutes(app: Hono): void
}
