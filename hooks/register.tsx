import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'

const CACHE_MINUTES = 60
const PANE = 'usage-band'
const snapshot = atom(
  { plugin: 'usage-band', key: 'snapshot' } as const,
  { tokens: null, memory: null, usd: null, fiveHour: null, sevenDay: null, startedAt: 0, lastResponseAt: 0, now: 0 } as Snapshot,
)

const bar = (percent: number, width = 8) => {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

// Graphical bar: an SVG pill where the surface carries `Svg` (desktop), else the text bar.
const gauge = (els: any, percent: number, width = 110) => {
  const { Svg, Text } = els
  if (!Svg) return <Text bold>{bar(percent)}</Text>
  const p = Math.max(0, Math.min(100, percent))
  const fill = Math.max(p > 0 ? 8 : 0, Math.round((p / 100) * width))
  const color = p >= 90 ? '#d64545' : p >= 70 ? '#e0a030' : '#5aa02c'
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="10" viewBox="0 0 ${width} 10">` +
    `<rect width="${width}" height="10" rx="5" fill="#8a8678" fill-opacity="0.3"/>` +
    (fill > 0 ? `<rect width="${fill}" height="10" rx="5" fill="${color}"/>` : '') +
    `</svg>`
  return <Svg source={source} alt={`${Math.round(p)}%`} width={width} height={10} />
}

const formatTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

async function refresh($: EngineInterface) {
  const u = await $.session.usage()
  const now = await $.clock.now()
  const rate = (kind: string) => u.rateLimits.find(r => r.kind === kind)?.percentUsed ?? null
  await update($, snapshot, s => ({
    ...s,
    tokens: u.context.tokens ?? s.tokens,
    memory: u.context.percent ?? s.memory,
    usd: u.cost?.usd ?? s.usd,
    fiveHour: rate('five_hour'),
    sevenDay: rate('seven_day'),
    startedAt: u.startedAt,
    lastResponseAt: s.lastResponseAt || now,
    now,
  }))
  await showStatus($)
}

async function showStatus($: EngineInterface) {
  const s = await read($, snapshot)
  const cacheLeft = Math.max(0, CACHE_MINUTES - Math.floor((s.now - s.lastResponseAt) / 60000))
  const pct = (p: number | null) => (p === null ? '–' : `${Math.round(p)}%`)
  const tokens = s.tokens === null ? '–' : formatTokens(s.tokens)
  const usd = s.usd === null ? '' : ` · ${s.usd.toFixed(2)}$`
  $.ui.status(`🧠 ${tokens}${usd} · ⏳ ${pct(s.fiveHour)} · 📅 ${pct(s.sevenDay)} · 🔥 ${cacheLeft}m`)
}

async function view($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0]) {
  const s = await read($, snapshot)
  const els = $.ui.resolve(e)
  const { Box, Text } = els

  const minutesOpen = s.startedAt ? Math.max(0, Math.floor((s.now - s.startedAt) / 60000)) : 0
  const cacheLeft = Math.max(0, CACHE_MINUTES - Math.floor((s.now - s.lastResponseAt) / 60000))
  const meter = (percent: number | null) => (percent === null ? <Text>–</Text> : gauge(els, percent))

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Box flexDirection="row" alignItems="center">
        <Text>🧠 memoria della chat </Text>
        {meter(s.memory)}
        <Text bold> {s.tokens === null ? '–' : `${formatTokens(s.tokens)} token`}</Text>
        {s.usd !== null && <Text dimColor> · speso {s.usd.toFixed(2)} $ a listino</Text>}
      </Box>
      <Box flexDirection="row" alignItems="center">
        <Text>⏳ uso 5 ore </Text>
        {meter(s.fiveHour)}
        <Text bold> {s.fiveHour === null ? '' : `${Math.round(s.fiveHour)}%`}</Text>
        <Text>   📅 uso settimana </Text>
        {meter(s.sevenDay)}
        <Text bold> {s.sevenDay === null ? '' : `${Math.round(s.sevenDay)}%`}</Text>
      </Box>
      <Box flexDirection="row">
        <Text>🕒 sessione aperta da </Text>
        <Text bold>{minutesOpen} min</Text>
        <Text>   🔥 {cacheLeft > 0 ? `cache calda ancora ${cacheLeft} min` : 'cache fredda'}</Text>
      </Box>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await refresh($)
    void $.ui.open({ id: PANE, title: 'Uso' })
    await $.command.register({
      name: 'usage-band',
      description: 'Mostra memoria della chat, costo, uso 5 ore/settimana e cache',
    })
    $.clock.every(30000, async () => {
      const now = await $.clock.now()
      await update($, snapshot, s => ({ ...s, now }))
      await showStatus($)
    })
    return next(e)
  })

  on('command.run', { command: 'usage-band' }, async $ => {
    await refresh($)
    const s = await read($, snapshot)
    const minutesOpen = s.startedAt ? Math.max(0, Math.floor((s.now - s.startedAt) / 60000)) : 0
    const cacheLeft = Math.max(0, CACHE_MINUTES - Math.floor((s.now - s.lastResponseAt) / 60000))
    const pct = (p: number | null) => (p === null ? '–' : `${bar(p)} ${Math.round(p)}%`)
    const text = [
      `🧠 memoria della chat ${s.tokens === null ? '–' : `${formatTokens(s.tokens)} token`}${s.usd === null ? '' : ` · speso ${s.usd.toFixed(2)} $ a listino`}`,
      `⏳ uso 5 ore ${pct(s.fiveHour)}   📅 uso settimana ${pct(s.sevenDay)}`,
      `🕒 sessione aperta da ${minutesOpen} min   🔥 ${cacheLeft > 0 ? `cache calda ancora ${cacheLeft} min` : 'cache fredda'}`,
    ].join('\n')

    return { text }
  })

  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, snapshot, s => ({ ...s, lastResponseAt: now, now }))
    await refresh($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    return view($, e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => view($, e))
}
