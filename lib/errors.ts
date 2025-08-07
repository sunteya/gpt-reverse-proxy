export class UpstreamNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpstreamNotFoundError'
  }
}

