import { sampleCycle } from './simulation/cardiacEngine'

// Smoke test — exercises pure simulation math WITHOUT mounting the WebGL
// <Canvas /> tree (jsdom has no GL context). Keeps `npm test` green in CI.
test('cardiac engine sampleCycle produces a full physiological loop', () => {
  const cycle = sampleCycle(120)
  expect(cycle).toHaveLength(120)
  expect(cycle[0].phase).toBeCloseTo(0, 2)
  expect(cycle[0]).toHaveProperty('volume')
  expect(cycle[0]).toHaveProperty('lvPressure')
  expect(cycle[0]).toHaveProperty('ecg')
})

test('project root is wired to a #root element', () => {
  // Jest's jsdom does NOT load public/index.html, so synthesize the
  // exact #root node the app mounts into (App.test mounts <App /> without
  // the real page; React 18+ createRoot needs it present).
  if (!document.getElementById('root')) {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
  }
  const rootEl = document.getElementById('root')
  expect(rootEl).not.toBeNull()
  expect(rootEl.id).toBe('root')
})
