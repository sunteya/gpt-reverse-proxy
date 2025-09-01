export abstract class KeywordInterceptorStream extends TransformStream<string, string> {
  preBuffer = ''
  postBuffer = ''
  intercepted = false

  keyword!: string

  constructor() {
    super({
      transform: (chunk, controller) => this.transform(chunk, controller),
      flush: (controller) => this.flush(controller),
    })
  }

  transform(chunk: string, controller: TransformStreamDefaultController<string>) {
    const buffer = this.preBuffer + this.postBuffer + chunk

    const result = this.matchKeyword(buffer)
    if (result.type == 'matched') {
      this.intercepted = true
      this.preBuffer = result.pre
      this.postBuffer = result.post
      this.processPostData()

      if (!this.intercepted) {
        this.enqueueBuffer(controller)
      }
    } else if (result.type == 'partial') {
      this.preBuffer = result.buffer
    } else {
      this.preBuffer = result.buffer
      this.enqueueBuffer(controller)
    }
  }

  abstract flush(controller: TransformStreamDefaultController<string>): void

  abstract processPostData(): void

  matchKeyword(raw: string) {
    const keywordIndex = raw.indexOf(this.keyword)
    if (keywordIndex != -1) {
      const pre = raw.substring(0, keywordIndex + this.keyword.length)
      const post = raw.substring(keywordIndex + this.keyword.length)
      return { type: 'matched', pre, post } as const
    } else if (this.isPartialMatch(raw, this.keyword)) {
      return { type: 'partial', buffer: raw } as const
    } else {
      return { type: 'not-matched', buffer: raw } as const
    }
  }

  enqueueBuffer(controller: TransformStreamDefaultController<string>) {
    const content = this.preBuffer + this.postBuffer
    this.preBuffer = ''
    this.postBuffer = ''

    if (content) {
      controller.enqueue(content)
    }
  }

  isPartialMatch(buffer: string, keyword: string): boolean {
    for (let i = Math.min(buffer.length, keyword.length - 1); i > 0; i--) {
      const suffix = buffer.substring(buffer.length - i)
      if (keyword.startsWith(suffix)) {
        return true
      }
    }

    return false
  }
}
