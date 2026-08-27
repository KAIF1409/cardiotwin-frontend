/**
 * BloodFlowSystem.jsx  —  REGISTRY-LOCKED DUAL-CIRCULATION GPU FLOW
 * ═════════════════════════════════════════════════════════════════
 * Instanced particle streams riding the EXACT vessel centre-lines from
 * anatomyRegistry.js (same curves VascularSystem extrudes into tube
 * walls) ⇒ blood visibly travels INSIDE every vessel.
 *
 *   🔴 OXYGENATED   #FF0033   lungs → LA → LV → Aorta → body
 *      chain A : PV_L → Mitral → Aorta
 *      chain B : PV_R → Mitral → Aorta     (denser shared trunk)
 *   🔵 DEOXYGENATED #0055FF   body → RA → RV → PA tree → lungs
 *      chain A : SVC → Tricuspid → PA trunk → Left PA
 *      chain B : IVC → Tricuspid → PA trunk → Right PA
 *
 * • Velocity & ejection density bind to master engine waveforms —
 *   BPM / contractility ↑ ⇒ faster, brighter flow pulses (spec §2.2).
 * • flowBus.focusId ⇒ hovered circuit brightens/accelerates, opposite
 *   dims — pure imperative, zero React re-render at 60 fps.
 */

import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getEngineState } from '../../simulation/cardiacEngine'
import {
  getPathCurve,
  FLOW_STYLE, flowBus, circuitForId,
} from '../../data/anatomyRegistry'

// ── Chain topology: branch split with merged shared trunks ───────────────────
const CHAINS = {
  systemic: [
    { ids: ['PVL', 'MITRAL', 'AO'],    ejectFrom: 0.46 },
    { ids: ['PVR', 'MITRAL', 'AO'],    ejectFrom: 0.46 },
  ],
  pulmonary: [
    { ids: ['SVC', 'TRIC', 'PAT', 'PAL'], ejectFrom: 0.52 },
    { ids: ['IVC', 'TRIC', 'PAT', 'PAR'], ejectFrom: 0.52 },
  ],
}

/** Sample each segment of a chain densely & fuse into ONE smooth curve. */
function buildChainCurve(chainIds) {
  const pts = []
  const SAMPLES = 22
  chainIds.forEach((id, si) => {
    const c = getPathCurve(id)
    const last = si === chainIds.length - 1
    for (let i = 0; i <= (last ? SAMPLES : SAMPLES - 1); i++) {
      pts.push(c.getPointAt(i / SAMPLES).clone())
    }
  })
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal')
}

/** Per-particle static attributes (deterministic-seeded for stable look). */
function makeStreamData(count, sizeBase) {
  const offsets = new Float32Array(count)
  const speeds  = new Float32Array(count)
  const sizes   = new Float32Array(count)
  let seed = count * 7919
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  for (let i = 0; i < count; i++) {
    offsets[i] = rnd()
    speeds[i]  = 0.72 + rnd() * 0.56
    sizes[i]   = sizeBase * (0.66 + rnd() * 0.68)
  }
  return { offsets, speeds, sizes }
}

const dummy = new THREE.Object3D()

// ── One glowing stream along a chain curve (core + additive halo shell) ──────
function FlowChain({ chain, color, circuit }) {
  const coreRef = useRef()
  const haloRef = useRef()

  // Curve + particle data are stable for the lifetime of the app
  const model = useMemo(() => {
    const curve = buildChainCurve(chain.ids)
    return {
      curve,
      len: curve.getLength(),
      count: Math.round(FLOW_STYLE.CORE_COUNT[circuit] / 2),
      prog: null,
      ...makeStreamData(Math.round(FLOW_STYLE.CORE_COUNT[circuit] / 2), 1.0),
      ejectFrom: chain.ejectFrom,
    }
  }, [chain, circuit])

  useEffect(() => { model.prog = Float32Array.from(model.offsets) }, [model])

  useFrame((_, rawDelta) => {
    const s     = getEngineState()
    const delta = Math.min(rawDelta, 0.05)
    const core  = coreRef.current
    if (!core || !model.prog) return

    // ── Circuit gating (SSLC circulation visualizer) ─────────────────────────
    let visible = true
    let flow, fill
    if (circuit === 'systemic') {
      if (s.circulationMode === 'pulmonary') visible = false
      flow = s.flowAortic;  fill = s.flowMitral
    } else {
      if (s.circulationMode === 'systemic') visible = false
      flow = s.flowPulmonary; fill = s.flowTricuspid ?? s.flowMitral * 0.9
    }
    core.visible = visible
    if (haloRef.current) haloRef.current.visible = visible

    // ── Hover focus modulation (imperative bus) ──────────────────────────────
    const hoverId   = flowBus.focusId
    const hoverCct  = hoverId ? circuitForId(hoverId) : null
    const focused   = hoverCct === circuit
    const dimmed    = hoverCct && !focused
    const boost     = focused ? 1.45 : 1

    // ── Velocity: base drift + strong systolic ejection + mild filling ───────
    const cycleSpeed = 60 / s.bpm
    const drive = ((0.16 + 1.5 * flow + 0.5 * fill) / cycleSpeed) *
                  boost * (dimmed ? 0.55 : 1)

    const contract = circuit === 'systemic' ? s.contractLV : s.contractRV
    const fade     = FLOW_STYLE.EDGE_FADE
    const pulseGlow = 0.65 + 0.6 * contract   // shared brightness term

    for (let i = 0; i < model.count; i++) {
      model.prog[i] = (model.prog[i] + delta * drive * model.speeds[i]) % 1
      const t = model.prog[i]

      model.curve.getPointAt(t, dummy.position)

      // Edge fade (heads/tails soften) — smoothstep in/out
      let edge = 1
      if (t < fade)        edge = t / fade
      else if (t > 1 - fade) edge = (1 - t) / fade
      edge = edge * edge * (3 - 2 * edge)

      // Bunch & brighten during ejection past the ventricle
      const inEject = flow > 0.35 && t > model.ejectFrom && t < model.ejectFrom + 0.34
      const sc = model.sizes[i] *
                 (inEject ? 1.5 : 0.9) *
                 (0.58 + 0.85 * contract) *
                 edge *
                 (focused ? 1.18 : 1)
      dummy.scale.setScalar(visible ? sc : 0.0001)
      dummy.updateMatrix()
      core.setMatrixAt(i, dummy.matrix)
      if (haloRef.current) {
        dummy.scale.setScalar(sc * 2.7)
        dummy.updateMatrix()
        haloRef.current.setMatrixAt(i, dummy.matrix)
      }
    }
    core.instanceMatrix.needsUpdate = true
    if (haloRef.current) haloRef.current.instanceMatrix.needsUpdate = true

    // Halo opacity breathes with contraction; dims when unfocused
    if (haloRef.current) {
      haloRef.current.material.opacity =
        FLOW_STYLE.HALO_ALPHA * pulseGlow * (dimmed ? 0.4 : boost)
    }
  })

  return (
    <>
      <instancedMesh ref={coreRef} args={[null, null, model.count]} frustumCulled={false}>
        <sphereGeometry args={[0.03, 10, 10]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={haloRef} args={[null, null, model.count]} frustumCulled={false} renderOrder={2}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={FLOW_STYLE.HALO_ALPHA}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  )
}

export default function BloodFlowSystem() {
  return (
    <group>
      {/* 🔴 Systemic — vivid crimson */}
      {CHAINS.systemic.map((chain, i) => (
        <FlowChain key={`sys_${i}`} chain={chain} color={FLOW_STYLE.O2_COLOR} circuit="systemic" />
      ))}
      {/* 🔵 Pulmonary — deep cobalt */}
      {CHAINS.pulmonary.map((chain, i) => (
        <FlowChain key={`pul_${i}`} chain={chain} color={FLOW_STYLE.DE_COLOR} circuit="pulmonary" />
      ))}
    </group>
  )
}

