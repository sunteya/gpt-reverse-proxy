import { MiddlewareHandler } from 'hono'
import { ProxyAgent } from 'undici'

export interface ProxyConfig {
  upstream_url: string
  upstream_authorization?: string | null
  https_proxy?: string | null
}

export const proxy = (config: ProxyConfig): MiddlewareHandler => {
  return async (c, next) => {
    const remoteUrl = new URL(config.upstream_url)
    const requestUrl = new URL(c.req.url)

    const rewritePath = c.get('rewrite_path') as string | undefined
    const path = rewritePath ?? requestUrl.pathname

    const targetUrl = new URL(path + requestUrl.search, remoteUrl.origin)

    if (remoteUrl.pathname && remoteUrl.pathname !== '/') {
      const remotePath = remoteUrl.pathname.replace(/\/$/, '')
      const incomingPath = targetUrl.pathname.replace(/^\//, '')
      targetUrl.pathname = `${remotePath}/${incomingPath}`
    }

    const headers = new Headers(c.req.header())
    headers.delete('host')
    if (config.upstream_authorization) {
      headers.set('authorization', config.upstream_authorization)
    }

    const agent = config.https_proxy ? new ProxyAgent(config.https_proxy) : undefined
    const dispatcher = agent ? { dispatcher: agent } : {}

    const response = await fetch(targetUrl.toString(), {
      method: c.req.method,
      headers: headers,
      body: c.req.raw.body,
      // @ts-ignore
      duplex: 'half',
      ...dispatcher,
    })

    return response
  }
}
