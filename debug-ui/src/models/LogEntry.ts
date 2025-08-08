export interface LogRawEntry {
  timestamp: string
  leg: 'user' | 'upstream'
  direction: 'request' | 'response'
  event: string
  payload: Record<string, any>
}

export interface LogInfoEntry extends LogRawEntry {
  event: 'info'
  payload: {
    url: string
    method: string
    headers: Record<string, string>
  }
}

export interface LogBodyEntry extends LogRawEntry {
  event: 'body'
}

export interface LogChunkEntry extends LogRawEntry {
  event: 'chunk'
  payload: {
    text: string
  }
}

export type LogEntry = LogInfoEntry | LogBodyEntry | LogChunkEntry