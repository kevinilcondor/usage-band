import { test, expect } from 'claude-code/testing'

test('the band mounts on the terminal without a measurement', async ({ ui }) => {
  const mounted = await ui.mount({
    plugin: 'usage-band',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false },
  })
  expect(mounted).toBeDefined()
})
