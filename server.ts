import { serve } from '@hono/node-server'
import consola from 'consola'
import { Hono } from 'hono'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import { createHandler } from './endpoints'
import { EndpointSettings, UpstreamSettings } from './endpoints/types'
import { HookRegistry } from './lib/HookRegistry'
import { Dumper, generateDumpFilePath } from './lib/dumper'
import { UpstreamRegistry } from './lib/UpstreamRegistry'
import path from 'path'

consola.level = 4

interface Config {
  endpoints: EndpointSettings[]
  upstreams: UpstreamSettings[]
}

function loadConfig(): Config {
  try {
    const configContent = fs.readFileSync('config.yml', 'utf8')
    return yaml.load(configContent) as Config
  } catch (error) {
    consola.error('Failed to load config.yml:', error)
    process.exit(1)
  }
}

const config = loadConfig()
consola.info(`Loaded ${config.endpoints.length} endpoints from config.yml`)

const root = process.cwd()
const hooks = new HookRegistry()
await hooks.loadFromDirectory(root, 'patches')
await hooks.loadFromDirectory(root, 'transformers')

const app = new Hono()
app.use('*', (c, next) => {
  consola.info(`url: ${c.req.method} ${c.req.url}`)

  const dumpFilePath = generateDumpFilePath(c.req.path)
  consola.info(`Dumping to ${dumpFilePath}`)
  const dumper = new Dumper(dumpFilePath)
  c.set('dumper', dumper)

  return next()
})

const upstreams = new UpstreamRegistry(config.upstreams, hooks)

for (const settings of config.endpoints) {
  consola.info(`Setting up ${settings.type} routes for ${settings.prefix}`)

  const handler = createHandler(settings.type, settings, upstreams, hooks)
  if (!handler) {
    consola.warn(`Unknown endpoint type: ${settings.type} for ${settings.prefix}`)
    continue
  }

  handler.setupEndpointRoutes(app)
}

const port = process.env.PORT ? parseInt(process.env.PORT) : 12000

serve({ fetch: app.fetch, port }, (info) => {
  consola.info(`Server listening on port ${info.port}`)
  consola.info(`Loaded ${config.upstreams.length} upstreams:`)
  for (const upstream of config.upstreams) {
    consola.info(`  ${upstream.name} -> ${upstream.api_base}`)
  }
  consola.info(`Configured ${config.endpoints.length} endpoints:`)
  for (const endpoint of config.endpoints) {
    consola.info(`  ${endpoint.prefix} (${endpoint.type})`)
  }
})
