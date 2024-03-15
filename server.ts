import http from 'http'
import https from 'https'
import { HttpsProxyAgent } from 'https-proxy-agent'
import dotenvFlow from 'dotenv-flow'
import _ from 'lodash'
import consola, { LogLevel } from 'consola'
import { URL } from 'url'
import { IncomingHttpHeaders } from 'http'

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

function makeCompatibleOpenCatWithKeya(chunk: Buffer, headers: IncomingHttpHeaders) {
  if (headers['content-type'] != 'text/event-stream') {
    return [ chunk ]
  }

  const lines = chunk.toString().split("\n")
  const chunk_lines = _.reduce(lines, (result, line) => {
    if (_.startsWith(line, "data: ")) {
      result.push([])
    } else if (result.length == 0) {
      result.push([])
    }
    _.last(result)!.push(line)
    return result
  }, <string[][]>[])

  const result = [] as string[]
  for (const lines of chunk_lines) {
    const group = lines.join("\n") + "\n"

    if (_.startsWith(group, "data: {")) {
      const json = JSON.parse(_.replace(group, /^data: /, ""))

      if ('finish_reason' in json) {
        for (const choice of json.choices) {
          choice.finish_reason ??= json.finish_reason
        }

        json.created ??= Math.floor(new Date().getTime() / 1000)
        json.model ??= ""
        delete json.finish_reason
      }

      const new_group = `data: ${JSON.stringify(json)}\n`
      result.push(new_group + "\n")
    } else {
      result.push(group + "\n")
    }
  }
  return result
}

const server = http.createServer((req, res) => {
  consola.info(`Request received: ${req.method} ${req.url}`)
  consola.info(`Request headers: `, req.headers)

  res.setHeader('Access-Control-Allow-Origin', req.headers["origin"] ?? "*")
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,authorization,content-type')

  if (req.method == "OPTIONS") {
    res.writeHead(200)
    res.end()
    return
  }

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
    port: parseInt(remoteUrl.port) || (remoteUrl.protocol == "https:" ? 443 : 80),
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

  const protocol = (remoteUrl.protocol == "https:") ? https : http
  const proxyReq = protocol.request(opts, (proxyRes) => {
    consola.info(`Proxy response received: ${proxyRes.statusCode} ${proxyRes.statusMessage}`)
    consola.info(`Proxy response headers: `, proxyRes.headers)
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers)

    proxyRes.on('data', (raw) => {
      consola.debug(`Received data from proxy: ${raw}`)


      const chunks = makeCompatibleOpenCatWithKeya(raw, proxyRes.headers)
      for (const chunk of chunks) {
        consola.debug("write chunk", chunk)
        res.write(chunk)
      }
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
