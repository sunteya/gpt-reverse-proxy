import http from 'http'
import dotenvFlow from 'dotenv-flow'
import _ from 'lodash'
import consola, { LogLevel } from 'consola'
import { logRequest } from './lib/logger.js'
import { proxyRequest } from './lib/proxy.js'

dotenvFlow.config()

const config = {
  remote_url: null! as string,
  remote_authorization: null as string | null,
  local_auth_token: null as string | null,
  local_path_prefix: "/" as string,
  https_proxy: null as string | null,
  log_level: "info" as string
}

for (const key in config) {
  config[key] = process.env[key] ?? process.env[key.toUpperCase()] ?? config[key]
}

const logLevelKey = _.capitalize(config.log_level) as keyof typeof LogLevel
consola.level = LogLevel[logLevelKey] ?? LogLevel.Info

consola.info("Config is", config)

const server = http.createServer((req, res) => {
  const wrappedReq = logRequest(req, res)

  proxyRequest(wrappedReq, res, {
    remote_url: config.remote_url,
    remote_authorization: config.remote_authorization,
    local_path_prefix: config.local_path_prefix,
    https_proxy: config.https_proxy
  })
})

server.listen(12000, () => {
  consola.info('Server listening on port 12000')
  consola.info('Request logging and proxy functionality separated into lib modules')
})