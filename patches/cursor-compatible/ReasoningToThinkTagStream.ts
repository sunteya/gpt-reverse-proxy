import { EventSourceEncoderStream } from '$$/lib/EventSourceEncoderStream'
import { createParser, EventSourceMessage, EventSourceParser } from 'eventsource-parser'

export class ReasoningToThinkTagStream extends TransformStream<string, string> {
  reasoningEvents = [] as EventSourceMessage[]
  postEvents = [] as EventSourceMessage[]
  postBuffer = ''

  parser = createParser({ onEvent: (it) => this.postEvents.push(it) })
  encoder = new EventSourceEncoderStream()

  state = 'pending' as 'pending' | 'thinking' | 'passthrough'

  constructor() {
    super({
      transform: (chunk, controller) => this.transform(chunk, controller),
      flush: controller => this.flush(controller),
    })
  }

  transform(chunk: string, controller: TransformStreamDefaultController<string>) {
    if (this.state == 'passthrough') {
      controller.enqueue(chunk)
      return
    }

    this.postBuffer += chunk
    let boundary = this.postBuffer.indexOf('\n\n')
    while (boundary !== -1) {
      const message = this.postBuffer.substring(0, boundary + 2)
      this.postBuffer = this.postBuffer.substring(boundary + 2)
      this.parser.feed(message)
      boundary = this.postBuffer.indexOf('\n\n')
    }

    this.processEvents(controller)
  }

  processEvents(controller: TransformStreamDefaultController<string>) {
    while (true) {
      const event = this.postEvents.shift()
      if (!event) break

      try {
        const json = JSON.parse(event.data)
        const hasReasoning = !!json.choices?.[0]?.delta?.reasoning_content
        if (this.state == 'pending') {
          if (hasReasoning) {
            this.state = 'thinking'
            json.choices[0].delta.content = '<think>' + json.choices[0].delta.reasoning_content
            delete json.choices[0].delta.reasoning_content
            delete json.choices[0].delta.reasoning
            this.reasoningEvents.push({ ...event, data: JSON.stringify(json) })
          } else {
            this.state = 'passthrough'
            this.postEvents.unshift(event)
            break
          }
        } else {
          if (hasReasoning) {
            const json = JSON.parse(event.data)
            json.choices[0].delta.content = json.choices[0].delta.reasoning_content
            delete json.choices[0].delta.reasoning_content
            delete json.choices[0].delta.reasoning
            this.reasoningEvents.push({ ...event, data: JSON.stringify(json) })
          } else {
            this.state = 'passthrough'
            this.postEvents.unshift(event)
            break
          }
        }
      } catch (e) {
        this.state = 'passthrough'
        this.postEvents.unshift(event)
        break
      }
    }

    if (this.state == 'passthrough') {
      this.finalizeAndFlush(controller)
    } else {
      while (true) {
        if (this.reasoningEvents.length <= 1) {
          break
        }

        const event = this.reasoningEvents.shift()!
        this.encoder.transform(event, controller)
      }
    }
  }

  finalizeAndFlush(controller: TransformStreamDefaultController<string>) {
    for (let i = 0; i < this.reasoningEvents.length; i++) {
      const event = this.reasoningEvents[i]
      if (i == this.reasoningEvents.length - 1) {
        const json = JSON.parse(event.data)
        json.choices[0].delta.content += '</think>'
        this.encoder.transform({ ...event, data: JSON.stringify(json) }, controller)
      } else {
        this.encoder.transform(event, controller)
      }
    }
    this.reasoningEvents = []

    for (const event of this.postEvents) {
      this.encoder.transform(event, controller)
    }
    this.postEvents = []

    if (this.postBuffer) {
      controller.enqueue(this.postBuffer)
      this.postBuffer = ''
    }
  }
  
  flush(controller: TransformStreamDefaultController<string>) {
    this.finalizeAndFlush(controller)
  }
}
