// Runtime smoke test — node smoke-test-paths.mjs
import { PATHS, getPathCurve, circuitForId } from './src/data/anatomyRegistry.js'

let tubes = 0, points = 0
// 1) every rendered vessel must resolve its tube curve by PUBLIC id
Object.values(PATHS).filter(p => !p.flowOnly).forEach(p => {
  const c = getPathCurve(p.id)
  const v = c.getPointAt(0)
  if (!c || !v.isVector3 || !Number.isFinite(v.x)) throw new Error('tube fail: ' + p.id)
  tubes++
})
// 2) every BloodFlowSystem chain segment must resolve by PUBLIC id
const CHAINS = [
  ['PVL', 'MITRAL', 'AO'], ['PVR', 'MITRAL', 'AO'],
  ['SVC', 'TRIC', 'PAT', 'PAL'], ['IVC', 'TRIC', 'PAT', 'PAR'],
]
CHAINS.flat().forEach(id => {
  const c = getPathCurve(id)
  if (!Number.isFinite(c.getPointAt(0.5).x)) throw new Error('chain fail: ' + id)
  points++
})
// 3) hover bus maps circuit correctly
if (circuitForId('AO') !== 'systemic') throw new Error('circuit fail AO')
if (circuitForId('PAT') !== 'pulmonary') throw new Error('circuit fail PAT')
if (circuitForId('RCA') !== 'systemic') throw new Error('circuit fail RCA')

console.log(`SMOKE PASS ✓  ${tubes} tube vessels · ${points} chain ids · hover-bus circuits OK`)
