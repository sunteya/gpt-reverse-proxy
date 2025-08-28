import { UpstreamProtocol, UpstreamSettings } from '../endpoints/types'
import { UpstreamNotFoundError } from './errors'
import { Upstream } from './Upstream'
import { HookRegistry } from './HookRegistry'
import { minimatch } from 'minimatch'
import consola from 'consola'
import { Breaker } from './Breaker'

export type FindUpstreamConds = { model?: string | null; protocol?: UpstreamProtocol | null }

export class UpstreamRegistry {
  config: UpstreamSettings[]
  hookRegistry: HookRegistry
  breaker: Breaker

  constructor(config: UpstreamSettings[], hookRegistry: HookRegistry) {
    this.config = config
    this.hookRegistry = hookRegistry
    this.breaker = new Breaker()
  }

  find(conds: FindUpstreamConds): Upstream {
    const settingsList = this.matchSettings(conds)
    if (!settingsList.length) {
      throw new UpstreamNotFoundError(`No upstream found for: ${conds}`)
    }
    return new Upstream(settingsList[0], this.hookRegistry)
  }

  findAll(conds: FindUpstreamConds): Upstream[] {
    const settingsList = this.matchSettings(conds)
    if (!settingsList.length) { return [] }
    return settingsList.map(s => new Upstream(s, this.hookRegistry))
  }

  matchSettings(conds: FindUpstreamConds): UpstreamSettings[] {
    consola.info(`Matching settings for: ${JSON.stringify(conds)}`)
    const matches = this.config.filter(settings => this.isMatchProtocol(settings, conds.protocol) && this.isMatchModel(settings, conds.model))
    const healthy = matches.filter(s => !this.breaker.isOpen(s.name))
    const list = healthy.length ? healthy : (matches.length ? [matches.slice().sort((a, b) => this.breaker.openUntil(a.name) - this.breaker.openUntil(b.name))[0]] : [])
    consola.info(`Found ${list.length} settings for: ${JSON.stringify(conds)}`)
    return list
  }

  isMatchProtocol(settings: UpstreamSettings, protocol: UpstreamProtocol | undefined | null) {
    if (!protocol) { return true }
    if (!settings.protocols) { return true }
    return settings.protocols.includes(protocol)
  }

  isMatchModel(settings: UpstreamSettings, model: string | null | undefined) {
    if (!model) { return true }
    if (!settings.models) { return true }
    return settings.models.some((pattern) => minimatch(model, pattern))
  }
}
