import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import dotenvFlow from 'dotenv-flow'
import _ from 'lodash'
import consola, { LogLevel } from 'consola'
import { logger } from './lib/hono-logger.js'
import { proxy } from './lib/hono-proxy.js'

dotenvFlow.config()

const config = {
  remote_url: null! as string,
  remote_authorization: null as string | null,
  local_path_prefix: "/" as string,
  https_proxy: null as string | null,
  log_level: "info" as string
}

for (const key in config) {
  // @ts-ignore
  config[key] = process.env[key] ?? process.env[key.toUpperCase()] ?? config[key]
}

const logLevelKey = _.capitalize(config.log_level) as keyof typeof LogLevel
consola.level = LogLevel[logLevelKey] ?? LogLevel.Info

consola.info("Config is", config)

const proxyConfig = {
  remote_url: config.remote_url,
  remote_authorization: config.remote_authorization,
  https_proxy: config.https_proxy,
}

const app = new Hono()
app.use('*', logger())

const routes = new Hono()

routes.post('/v1/chat/completions', async (c) => {
  const response = await proxy(proxyConfig)(c, async () => {})

  if (!response) {
    return c.text('Proxy middleware failed to return a response.', 500)
  }

  if (!response.body) {
    return response
  }

  const { readable, writable } = new TransformStream({
    transform(chunk, controller) {
      const modifiedChunk = Buffer.from(chunk)
        .toString('utf-8')
        .replace(/,"finish_reason":null/g, '')
        .replace(/,"usage":null/g, '')
      controller.enqueue(new TextEncoder().encode(modifiedChunk))
    },
  })

  response.body.pipeTo(writable)
  return new Response(readable, response)
})

routes.all('*', (c, next) => proxy(proxyConfig)(c, next))

const prefix = config.local_path_prefix
if (prefix && prefix !== '/') {
  app.route(prefix, routes)
} else {
  app.route('/', routes)
}

serve({
  fetch: app.fetch,
  port: 12000
}, (info) => {
  consola.info(`Server listening on port ${info.port}`)
})