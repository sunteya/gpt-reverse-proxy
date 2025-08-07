import { Dumper } from "./dumper"

export class DumpStream extends TransformStream<string, string> {
  constructor(type: string, dumper: Dumper) {
    super({
      transform(source, controller) {
        dumper.dump(type, { raw: source })
        controller.enqueue(source)
      }
    })
  }
}
