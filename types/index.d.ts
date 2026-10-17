export type Snapshot = {
  tokens: number | null
  memory: number | null
  usd: number | null
  fiveHour: number | null
  sevenDay: number | null
  startedAt: number
  lastResponseAt: number
  now: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { snapshot: Snapshot }
  }
}
