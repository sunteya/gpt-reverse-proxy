import http from 'http'
import { createProxyMiddleware, Options } from 'http-proxy-middleware'
import { HttpsProxyAgent } from 'https-proxy-agent'
import _ from 'lodash'
import consola from 'consola'
import { URL } from 'url'

export interface ProxyConfig {
  remote_url: string
  remote_authorization?: string | null
  local_path_prefix?: string
  https_proxy?: string | null
}

export function createProxy(config: ProxyConfig) {
  const remoteUrl = new URL(config.remote_url)

  // Standardize local_path_prefix
  const localPathPrefix = (!config.local_path_prefix || config.local_path_prefix === '/') 
    ? '' 
    : config.local_path_prefix

  const proxyOptions: Options<http.IncomingMessage, http.ServerResponse> = {
    // target includes protocol, domain, and port; the path is handled separately
    target: `${remoteUrl.protocol}//${remoteUrl.host}`,
    changeOrigin: true,

    pathRewrite: (path: string) => {
      let cleanPath = path

      // 1. Remove local path prefix (if it exists)
      if (localPathPrefix) {
        cleanPath = _.trimStart(path, localPathPrefix)
      }

      // 2. Add remote path prefix (if it exists)
      let rewrittenPath: string
      if (remoteUrl.pathname && remoteUrl.pathname !== '/') {
        // Ensure paths are concatenated correctly, avoiding double slashes
        const remotePath = remoteUrl.pathname.replace(/\/$/, '')
        const localPath = cleanPath.replace(/^\//, '')
        rewrittenPath = `${remotePath}/${localPath}`
      } else {
        rewrittenPath = cleanPath
      }

      consola.debug(`Path rewrite: ${path} -> ${rewrittenPath}`)
      return rewrittenPath
    },

    ...(config.https_proxy && { agent: new HttpsProxyAgent(config.https_proxy) }),

    selfHandleResponse: true,
    
    on: {
      proxyReq: (proxyReq: http.ClientRequest, req: http.IncomingMessage) => {
        if (config.remote_authorization) {
          proxyReq.setHeader('authorization', config.remote_authorization)
        }
      },
      
      proxyRes: (proxyRes: http.IncomingMessage, req: http.IncomingMessage, res: http.ServerResponse) => {
        if (req.httpVersion !== proxyRes.httpVersion) {
          consola.info(`Protocol conversion: Client HTTP/${req.httpVersion} ↔ Upstream HTTP/${proxyRes.httpVersion}`)
        }

        // Copy original headers and status code
        res.statusCode = proxyRes.statusCode!;
        Object.keys(proxyRes.headers).forEach((key) => {
          res.setHeader(key, proxyRes.headers[key]!);
        });
        
        proxyRes.on('data', (chunk: Buffer) => {
          const modifiedChunk = chunk.toString('utf-8')
            .replace(/,"finish_reason":null/g, '')
            .replace(/,"usage":null/g, '');
          res.write(modifiedChunk);
        });

        proxyRes.on('end', () => {
          res.end();
        });

        proxyRes.on('error', (err: Error) => {
          consola.error('Proxy response error', err);
          res.end();
        });
      }
    }
  } satisfies Options<http.IncomingMessage, http.ServerResponse>

  return createProxyMiddleware(proxyOptions)
}

export function proxyRequest(req: http.IncomingMessage, res: http.ServerResponse, config: ProxyConfig) {
  const proxy = createProxy(config)
  proxy(req, res)
}