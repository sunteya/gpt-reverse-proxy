import { Dumper } from "./Dumper"

export class DumpStream extends TransformStream<string, string> {
  constructor(type: string, dumper: Dumper) {
    super({
      transform(source, controller) {
        // dumper.dump('response', type, { raw: source })
        controller.enqueue(source)
      }
    })
  }
}
