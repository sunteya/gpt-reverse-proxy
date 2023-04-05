import http from 'http'
import https from 'https'
import { HttpsProxyAgent } from 'https-proxy-agent'
import dotenvFlow from 'dotenv-flow'
import _ from 'lodash'
import consola, { LogLevel } from 'consola'
import { URL } from 'url'

dotenvFlow.config()

const config = {
  remote_url: null! as string,
  remote_authorization: null as string | null,

  local_auth_token: null as string | null,
  local_path_prefix: "/" as string,

  https_proxy: null as string | null,
  log_level: "Info" as string
}

for (const key in config) {
  config[key] = process.env[key] ?? process.env[key.toUpperCase()] ?? config[key]
}
if (_.isEmpty(config.local_path_prefix)) {
  config.local_path_prefix = "/"
}

consola.level = LogLevel[config.log_level] ?? LogLevel.Info
consola.info("Config is", config)

const remoteUrl = new URL(config.remote_url)
if (remoteUrl.protocol != "https:") {
  throw new Error("Only https is supported")
}

const server = http.createServer((req, res) => {
  consola.info(`Request received: ${req.method} ${req.url}`)
  consola.debug(`Request headers: `, req.headers)

  if (config.local_auth_token && !_.includes(req.headers.authorization, config.local_auth_token)) {
    consola.info("Request auth token is invalid")
    res.statusCode = 401
    res.end("Unauthorized")
    return
  }

  let path = req.url
  if (!_.startsWith(path, config.local_path_prefix)) {
    consola.info("Request path not match prefix.")
    res.statusCode = 404
    res.end("Not found")
    return
  }

  path = _.trimStart(path, config.local_path_prefix)
  path = remoteUrl.pathname + path

  const opts = {
    hostname: remoteUrl.hostname,
    port: parseInt(remoteUrl.port) || 443,
    path: path,
    method: req.method,
    headers: req.headers
  }

  delete opts.headers['host']

  if (config.remote_authorization) {
    opts.headers['authorization'] = config.remote_authorization
  }

  if (config.https_proxy) {
    opts['agent'] = new HttpsProxyAgent(config.https_proxy)
  }

  const proxyReq = https.request(opts, (proxyRes) => {
    consola.info(`Proxy response received: ${proxyRes.statusCode} ${proxyRes.statusMessage}`)
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers)

    proxyRes.on('data', (chunk) => {
      consola.debug(`Received data from proxy: ${chunk}`)
      res.write(chunk)
    })

    proxyRes.on('end', () => {
      consola.debug('Proxy response ended')
      res.end()
    })
  })

  proxyReq.on('error', (err) => {
    res.statusCode = 500
    res.write(err.message)
    res.end()
  })

  req.on('data', (chunk) => {
    consola.debug(`Received data from client: ${chunk}`)
    proxyReq.write(chunk)
  })

  req.on('end', () => {
    consola.debug('Request ended')
    proxyReq.end()
  })
})

server.listen(3000, () => {
  consola.info('Proxy server listening on port 3000')
})
