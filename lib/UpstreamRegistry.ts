import { UpstreamSettings } from '../endpoints/types'
import { UpstreamNotFoundError } from './errors'
import { Upstream } from '../proxy/proxy'

export class UpstreamRegistry {
  private upstreams: UpstreamSettings[]
  private defaultGroup?: string

  constructor(upstreams: UpstreamSettings[], defaultGroup?: string) {
    this.upstreams = upstreams
    this.defaultGroup = defaultGroup
  }

    find({ group, model, protocol }: { group?: string; model?: string | null; protocol?: string | null }): Upstream {
    const targetGroup = group || this.defaultGroup
    const settings = this.findUpstreamForGroup(targetGroup)
    if (!settings) {
      throw new UpstreamNotFoundError(`No upstream found for group: ${targetGroup}`)
    }
    return new Upstream(settings)
  }

  findUpstreamForGroup(group: string | undefined): UpstreamSettings | null {
    for (const upstream of this.upstreams) {
      if (upstream.groups == undefined) {
        return upstream
      }

      if (group == undefined) {
        return upstream
      }

      if (upstream.groups.includes(group)) {
        return upstream
      }
    }
    return null
  }
}
