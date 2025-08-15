import type { BreakerSettings } from '../endpoints/types'

export class Breaker {
  private states: Map<string, number> = new Map()

  isOpen(name: string) {
    const until = this.states.get(name)
    return !!until && until > Date.now()
  }

  openUntil(name: string) {
    return this.states.get(name) || 0
  }

  markFailure(name: string, settings?: BreakerSettings) {
    const cooldownMs = settings?.cooldown_ms ?? 30000
    if (cooldownMs > 0) { this.states.set(name, Date.now() + cooldownMs) }
  }

  markSuccess(name: string) {
    this.states.delete(name)
  }
}


