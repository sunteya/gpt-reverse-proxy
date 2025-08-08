import { UpstreamSettings } from '../endpoints/types'
import { UpstreamNotFoundError } from './errors'
import { Upstream } from './Upstream'
import { HookRegistry } from './HookRegistry'
import { minimatch } from 'minimatch'
import consola from 'consola'

export type FindUpstreamConds = {
  group?: string
  model?: string | null
  protocol?: string | null
}

export class UpstreamRegistry {
  config: UpstreamSettings[]
  hookRegistry: HookRegistry

  constructor(config: UpstreamSettings[], hookRegistry: HookRegistry) {
    this.config = config
    this.hookRegistry = hookRegistry
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
    const availableSettings = this.config.filter(settings => this.isMatchProtocol(settings, conds.protocol) && this.isMatchModel(settings, conds.model))
    consola.info(`Found ${availableSettings.length} settings for: ${JSON.stringify(conds)}`)
    return availableSettings
  }

  isMatchProtocol(settings: UpstreamSettings, protocol: string | undefined | null) {
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
