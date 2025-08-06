import { ProxyAgent } from 'undici'
import consola from 'consola'

export interface ProxyConfig {
  upstream_url: string
  upstream_key: string
  https_proxy?: string | null
}

export const proxy = async (request: Request, config: ProxyConfig): Promise<Response> => {
  const remoteUrl = new URL(config.upstream_url)
  const requestUrl = new URL(request.url)

  const targetUrl = new URL(requestUrl.pathname + requestUrl.search, remoteUrl.origin)

  if (remoteUrl.pathname && remoteUrl.pathname !== '/') {
    const remotePath = remoteUrl.pathname.replace(/\/$/, '')
    const incomingPath = targetUrl.pathname.replace(/^\//, '')
    targetUrl.pathname = `${remotePath}/${incomingPath}`
  }

  consola.info(`Proxying request: ${request.method} ${request.url} -> ${targetUrl.toString()}`)

  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.set('Authorization', `Bearer ${config.upstream_key}`)

  const agent = config.https_proxy ? new ProxyAgent(config.https_proxy) : undefined
  const dispatcher = agent ? { dispatcher: agent } : {}

  const response = await fetch(targetUrl.toString(), {
    method: request.method,
    headers: headers,
    body: request.body,
    // @ts-ignore
    duplex: 'half',
    ...dispatcher,
  })

  consola.info(`Response received: ${response.status} ${response.statusText}`)

  return response
}
