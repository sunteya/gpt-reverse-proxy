import { EventSourceMessage } from "eventsource-parser"

export class EventSourceEncoderStream extends TransformStream<EventSourceMessage, string> {

  constructor() {
    super({
      transform: (source, controller) => {
        return this.transform(source, controller)
      }
    })
  }

  transform(source: EventSourceMessage, controller: TransformStreamDefaultController<string>) {
    const lines: string[] = []
    if (source.id) {
      lines.push(`id: ${source.id}`)
    }
    if (source.event) {
      lines.push(`event: ${source.event}`)
    }

    // if (source.retry) {
    //   lines.push(`retry: ${source.retry}`)
    // }

    // The data field is the core part and needs special handling for multiline data
    // SSE specification requires that each newline in data must be followed by a new "data: " prefix
    const dataLines = source.data.split('\n')
    for (const line of dataLines) {
      lines.push(`data: ${line}`)
    }

    if (lines.length > 0) {
      const chunk = lines.join('\n') + '\n\n';
      controller.enqueue(chunk);
    } else {
      // If it is an empty message (e.g., heartbeat comment), you can return a comment or an empty string
      // controller.enqueue(":\n\n"); // Optional: heartbeat comment
    }
  }
}