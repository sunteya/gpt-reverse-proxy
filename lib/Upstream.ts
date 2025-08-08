import { ProxyAgent } from 'undici'
import consola from 'consola'
import { Context } from 'hono'
import { UpstreamSettings } from '../endpoints/types'
import { HookRegistry } from '../lib/HookRegistry'
import { Hook } from '../lib/Hook'
import { Dumper } from './Dumper'
import { dumpRequest, dumpResponse } from './logger'

export class Upstream {
  settings: UpstreamSettings
  plugins: Hook[]

  get name() { return this.settings.name ?? 'unknown' }

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

    const headers = new Headers(request.headers)
    headers.delete('host')
    headers.set('Authorization', `Bearer ${this.settings.api_key}`)

    const finalRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
    })

    const dumper = c.get('dumper') as Dumper | null
    const requestToFetch = dumper ? dumpRequest(dumper, 'upstream', finalRequest) : finalRequest

    consola.info(`Proxying request: [${this.name}] ${c.req.method} ${c.req.path} -> ${targetUrl.toString()}`)

    const agent = this.settings.https_proxy ? new ProxyAgent(this.settings.https_proxy) : undefined
    const dispatcher = agent ? { dispatcher: agent } : {}

    const rawResponse = await fetch(requestToFetch, {
      // @ts-ignore
      duplex: 'half',
      ...dispatcher,
    })

    consola.info(`Response received: ${rawResponse.status} ${rawResponse.statusText}`)

    const responseToHook = dumper ? dumpResponse(dumper, 'upstream', rawResponse) : rawResponse

    const response = await this.hookResponse(responseToHook, rawRequest, c)
    return response
  }
}
