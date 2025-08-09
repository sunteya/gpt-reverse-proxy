import { Model as OpenAIModel } from 'openai/resources/models'
import { ModelResponse as RawOllamaTag } from 'ollama'
import dayjs from 'dayjs'

export type OllamaTag = Partial<RawOllamaTag>

export function openaiModelsResponseToOllama(json: { data: OpenAIModel[] }) {
  const models: OllamaTag[] = json.data.map((m: OpenAIModel) => {
    return {
      name: m.id,
      model: m.id,
      modified_at: dayjs.unix(m.created).toDate(),
    }
  })
  return { models }
}


