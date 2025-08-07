import { ProxyAgent } from 'undici'
import consola from 'consola'
import { Context } from 'hono'
import { UpstreamSettings } from '../endpoints/types'
import { HookRegistry } from '../lib/HookRegistry'
import { Hook } from '../lib/Hook'

export class Upstream {
  settings: UpstreamSettings
  plugins: Hook[]

  constructor(settings: UpstreamSettings, hookRegistry: HookRegistry) {
    this.settings = settings
    this.plugins = hookRegistry.getHooks(settings.plugins ?? [])
  }

  async hookRequest(request: Request, ctx: Context): Promise<Request> {
    let modifiedRequest = request
    for (const hook of this.plugins) {
      modifiedRequest = await hook.onRequest(modifiedRequest, ctx)
    }

    return modifiedRequest
  }

  async hookResponse(response: Response, request: Request, ctx: Context): Promise<Response> {
    let modifiedResponse = response
    for (const hook of this.plugins.reverse()) {
      modifiedResponse = await hook.onResponse(modifiedResponse, request, ctx)
    }
    
    return modifiedResponse
  }

  async handle(rawRequest: Request, c: Context): Promise<Response> {
    consola.info(`upstream.handle`)
    const request = await this.hookRequest(rawRequest, c)

    const remoteUrl = new URL(this.settings.api_base)
    const requestUrl = new URL(request.url)

    const dumper = c.get('dumper')
    const targetUrl = new URL(requestUrl.pathname + requestUrl.search, remoteUrl.origin)

    if (remoteUrl.pathname && remoteUrl.pathname !== '/') {
      let remotePath = remoteUrl.pathname
      if (remotePath.endsWith('/')) {
        remotePath = remotePath.slice(0, -1)
      }
      let incomingPath = targetUrl.pathname
      if (incomingPath.startsWith('/')) {
        incomingPath = incomingPath.slice(1)
      }
      targetUrl.pathname = `${remotePath}/${incomingPath}`
    }

    consola.info(`Proxying request: ${c.req.method} ${c.req.path} -> ${targetUrl.toString()}`)

    const headers = new Headers(request.headers)
    headers.delete('host')
    headers.set('Authorization', `Bearer ${this.settings.api_key}`)
    const body = await c.req.raw.clone().text()

    dumper?.dump('request', {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(headers.entries()),
      body: body
    })

    const agent = this.settings.https_proxy ? new ProxyAgent(this.settings.https_proxy) : undefined
    const dispatcher = agent ? { dispatcher: agent } : {}

    const rawResponse = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: headers,
      body: request.body,
      // @ts-ignore
      duplex: 'half',
      ...dispatcher,
    })

    consola.info(`Response received: ${rawResponse.status} ${rawResponse.statusText}`)

    const response = await this.hookResponse(rawResponse, request, c)
    return response
  }
}
