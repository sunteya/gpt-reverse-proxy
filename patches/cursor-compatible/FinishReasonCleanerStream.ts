import { KeywordInterceptorStream } from "./KeywordInterceptorStream"

export class FinishReasonCleanerStream extends KeywordInterceptorStream {
  keyword = ',"finish_reason":'

  flush(controller: TransformStreamDefaultController<string>) {
    if (this.intercepted) {
      this.processPostData()
    }

    this.enqueueBuffer(controller)
  }

  processPostData() {
    const target = "null"

    const buffer = this.postBuffer.trimStart()
    if (buffer.startsWith(target)) {
      this.preBuffer = this.preBuffer.substring(0, this.preBuffer.length - this.keyword.length)
      this.postBuffer = buffer.substring(target.length)

      const result = this.matchKeyword(this.postBuffer)
      if (result.type == 'matched') {
          this.preBuffer += result.pre
          this.postBuffer = result.post
          this.processPostData()
      } else if (result.type == 'partial') {
          this.preBuffer += result.buffer
          this.postBuffer = ''
          // wait for next chunk
      } else {
          this.intercepted = false
      }
    } else if (target.startsWith(buffer)) {
      // Do nothing and let the state be preserved for the next chunk.
    } else {
      this.intercepted = false
    }
  }
}
