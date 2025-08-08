import { EventSourceMessage } from "eventsource-parser"
import { Dumper } from "./Dumper"

export class DumpEventSourceStream extends TransformStream<EventSourceMessage, EventSourceMessage> {
  constructor(type: string, dumper: Dumper | null) {
    super({
      transform(source, controller) {
        // dumper?.dump('response', type, source)
        controller.enqueue(source)
      }
    })
  }
}
