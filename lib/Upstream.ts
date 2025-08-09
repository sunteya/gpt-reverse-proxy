import consola from 'consola'
import { ProxyAgent } from 'undici'
import { UpstreamSettings } from '../endpoints/types'
import { Hook } from '../lib/Hook'
import { HookRegistry } from '../lib/HookRegistry'
import { EndpointEnv } from './EndpointEnv'
import { dumpRequest, dumpResponse } from './Dumper'
import { HookRunner } from './HookRunner'

export class Upstream {
  settings: UpstreamSettings
  plugins: Hook[]

  get name() { return this.settings.name ?? 'unknown' }

  constructor(settings: UpstreamSettings, hookRegistry: HookRegistry) {
    this.settings = settings
    this.plugins = hookRegistry.getHooks(settings.plugins ?? [])
  }

  async handle(rawRequest: Request, env: EndpointEnv, interceptors: Hook[] = []): Promise<Response> {
    const runner = new HookRunner([...interceptors, ...this.plugins], env)
    const request = await runner.runRequest(rawRequest)

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
    headers.delete('content-length')
    headers.delete('content-encoding')
    if (this.settings.api_key) {
      headers.set('authorization', `Bearer ${this.settings.api_key}`)
    }

    const finalRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
    })

    const dumper = env.dumper
    const requestToFetch = dumper ? dumpRequest(dumper, 'upstream', finalRequest) : finalRequest

    consola.info(`Proxying request: [${this.name}] ${request.method} ${new URL(request.url).pathname} -> ${targetUrl.toString()}`)

    const agent = this.settings.https_proxy ? new ProxyAgent(this.settings.https_proxy) : undefined
    const dispatcher = agent ? { dispatcher: agent } : {}

    const rawResponse = await fetch(requestToFetch, {
      // @ts-ignore
      duplex: 'half',
      ...dispatcher,
    })

    consola.info(`Response received: ${rawResponse.status} ${rawResponse.statusText}`)

    const responseToHook = dumper ? dumpResponse(dumper, 'upstream', rawResponse) : rawResponse
    return await runner.runResponse(responseToHook)
  }
}
