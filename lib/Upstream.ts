import consola from 'consola'
import { ProxyAgent } from 'undici'
import { UpstreamSettings } from '../endpoints/types'
import { Hook } from '../lib/Hook'
import { HookRegistry } from '../lib/HookRegistry'
import { EndpointEnv } from './EndpointEnv'
import { dumpRequest, dumpResponse } from './Dumper'
import { HookRunner } from './HookRunner'
import { OPENAI_CHAT_COMPLETIONS_PATH } from '../protocols/openai'
import { CLAUDE_MESSAGES_PATH } from '../protocols/claude'
import { O } from 'ollama/dist/shared/ollama.f6eae8b3'

export class Upstream {
  settings: UpstreamSettings
  plugins: Hook[]

  get name() {
    return this.settings.name ?? 'unknown'
  }

  constructor(settings: UpstreamSettings, hookRegistry: HookRegistry) {
    this.settings = settings
    this.plugins = hookRegistry.buildHooks(settings.plugins)
  }

  isModelEndpointPath(pathname: string): boolean {
    const protocols = this.settings.protocols || []

    if (protocols.includes('openai') || protocols.includes('ollama')) {
      if (pathname.endsWith(OPENAI_CHAT_COMPLETIONS_PATH)) {
        return true
      }
    }

    if (protocols.includes('claude')) {
      if (pathname.endsWith(CLAUDE_MESSAGES_PATH)) {
        return true
      }
    }

    return false
  }

  async buildUpstreamRequest(request: Request): Promise<Request> {
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
    
    headers.delete('x-forwarded-for')
    headers.delete('x-forwarded-host')
    headers.delete('x-forwarded-port')
    headers.delete('x-forwarded-proto')
    headers.delete('x-forwarded-server')

    // headers.delete('accept-encoding')
    if (this.settings.api_key) {
      headers.set('authorization', `Bearer ${this.settings.api_key}`)
    }

    const finalRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
    })

    return finalRequest
  }

  async handle(
    rawRequest: Request,
    env: EndpointEnv,
    interceptors: Hook[] = []
  ): Promise<Response> {
    const runner = new HookRunner([...interceptors, ...this.plugins], env)
    const request = await runner.runRequest(rawRequest)

    const finalRequest = await this.buildUpstreamRequest(request)

    const dumper = env.dumper
    const requestToFetch = dumper ? dumpRequest(dumper, 'upstream', finalRequest) : finalRequest

    consola.info(`Proxying request: [${this.name}] ${request.method} ${new URL(request.url).pathname} -> ${finalRequest.url}`)

    const agent = this.settings.https_proxy ? new ProxyAgent(this.settings.https_proxy) : undefined
    const dispatcher = agent ? { dispatcher: agent } : {}

    try {
      const rawResponse = await fetch(requestToFetch, {
        // @ts-ignore
        duplex: 'half',
        ...dispatcher,
      })

      consola.info(`Response received: ${rawResponse.status} ${rawResponse.statusText}`)

      const responseToHook = dumper ? dumpResponse(dumper, 'upstream', rawResponse) : rawResponse
      const hooked = await runner.runResponse(responseToHook)

      const cleanedHeaders = new Headers(hooked.headers)
      // const hopByHop = ['connection', 'transfer-encoding', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'upgrade']
      // for (const h of hopByHop) {
      //   cleanedHeaders.delete(h)
      // }
      cleanedHeaders.delete('content-length')
      cleanedHeaders.delete('content-encoding')

      return new Response(hooked.body, {
        status: hooked.status,
        statusText: hooked.statusText,
        headers: cleanedHeaders,
      })
    } catch (e) {
      const error = e as any
      if (error.cause?.code === 'UND_ERR_BODY_TIMEOUT' || error.message === 'terminated') {
        consola.error('Upstream request timed out.', error)
        return new Response('Gateway Timeout', { status: 504 })
      }
      consola.error('Error fetching from upstream.', error)
      return new Response('Bad Gateway', { status: 502 })
    }
  }
}
