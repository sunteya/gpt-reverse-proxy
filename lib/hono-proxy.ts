import { MiddlewareHandler } from 'hono'
import { ProxyAgent } from 'undici'

export interface ProxyConfig {
  remote_url: string
  remote_authorization?: string | null
  https_proxy?: string | null
}

export const proxy = (config: ProxyConfig): MiddlewareHandler => {
  return async (c, next) => {
    const remoteUrl = new URL(config.remote_url)
    const requestUrl = new URL(c.req.url)

    const targetUrl = new URL(requestUrl.pathname + requestUrl.search, remoteUrl.origin)

    if (remoteUrl.pathname && remoteUrl.pathname !== '/') {
      const remotePath = remoteUrl.pathname.replace(/\/$/, '')
      const incomingPath = targetUrl.pathname.replace(/^\//, '')
      targetUrl.pathname = `${remotePath}/${incomingPath}`
    }

    const headers = new Headers(c.req.header())
    headers.delete('host')
    if (config.remote_authorization) {
      headers.set('authorization', config.remote_authorization)
    }

    const agent = config.https_proxy ? new ProxyAgent(config.https_proxy) : undefined
    // @ts-ignore
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
