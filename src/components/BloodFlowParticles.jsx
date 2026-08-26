/**
 * BloodFlowParticles.jsx — dynamic dual-circulation particle system
 * ══════════════════════════════════════════════════════════════════
 * High-performance THREE.InstancedMesh streams riding Catmull-Rom
 * vessel curves:
 *
 *   🔵 DEOXYGENATED  body → RA → RV → Pulmonary Artery → lungs
 *                    ejects during RIGHT ventricular systole
 *   🔴 OXYGENATED    lungs → LA → LV → Aorta → body
 *                    ejects during LEFT ventricular systole
 *
 * Particle velocity + ejection density are driven by the master engine's
 * flowAortic / flowPulmonary / flowMitral waveforms, so flow visibly
 * PULSES with systole and accelerates when BPM or contractility rise.
 * Circulation-mode override (SSLC visualizer) dims one circuit.
 */

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getEngineState } from '../simulation/cardiacEngine'

const COLOR_O2 = new THREE.Color('#00F2FE')   // oxygenated — neon cyan
const COLOR_DE = new THREE.Color('#2563EB')   // deoxygenated — deep cobalt

const COUNT_LEFT  = 130   // systemic circuit particles
const COUNT_RIGHT = 110   // pulmonary circuit particles

// Waypoints tuned to the anatomical label anchors (HeartLabels.jsx)
const LEFT_WAYPOINTS = [
  new THREE.Vector3(-0.55,  0.55, -0.45),   // pulmonary veins return
  new THREE.Vector3(-0.30,  0.30, -0.22),   // LA
  new THREE.Vector3(-0.20, -0.02,  0.02),   // through mitral valve
  new THREE.Vector3(-0.16, -0.28,  0.10),   // LV apex
  new THREE.Vector3(-0.14,  0.18,  0.06),   // LVOT
  new THREE.Vector3(-0.10,  0.62,  0.04),   // aortic arch
  new THREE.Vector3(-0.35,  1.05,  0.00),   // descending to body
]

const RIGHT_WAYPOINTS = [
  new THREE.Vector3( 0.60,  0.50, -0.40),   // vena cava return
  new THREE.Vector3( 0.32,  0.28, -0.16),   // RA
  new THREE.Vector3( 0.24, -0.04,  0.06),   // tricuspid
  new THREE.Vector3( 0.20, -0.26,  0.10),   // RV apex
  new THREE.Vector3( 0.17,  0.20,  0.08),   // RVOT
  new THREE.Vector3( 0.14,  0.58,  0.10),   // PA bifurcation
  new THREE.Vector3( 0.42,  0.95,  0.02),   // to lungs
]

function makeStream(count, color, waypoints, opts) {
  const curve   = new THREE.CatmullRomCurve3(waypoints)
  const offsets = new Float32Array(count)
  const speeds  = new Float32Array(count)
  const sizes   = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    offsets[i] = Math.random()
    speeds[i]  = 0.75 + Math.random() * 0.5
    sizes[i]   = opts.sizeBase * (0.7 + Math.random() * 0.6)
  }
  return { curve, offsets, speeds, sizes, color, ...opts }
}

const dummy = new THREE.Object3D()

function Stream({ data }) {
  const ref = useRef()
  // stable per-particle progress array
  const prog = useMemo(() => Float32Array.from(data.offsets), [data])

  useFrame((_, rawDelta) => {
    const s     = getEngineState()
    const delta = Math.min(rawDelta, 0.05)

    // Circuit gating (SSLC circulation visualizer)
    let flow, fill, visible = true
    if (data.circuit === 'systemic') {
      if (s.circulationMode === 'pulmonary') visible = false
      flow = s.flowAortic; fill = s.flowMitral
    } else {
      if (s.circulationMode === 'systemic') visible = false
      flow = s.flowPulmonary; fill = s.flowTricuspid ?? s.flowMitral * 0.9
    }

    const mesh = ref.current
    if (!mesh) return
    mesh.visible = visible

    const cycleSpeed = 60 / s.bpm
    // velocity scales with: base drift + strong ejection pulse + mild fill suction
    const drive = (0.16 + 1.5 * flow + 0.5 * fill) / cycleSpeed

    for (let i = 0; i < data.count; i++) {
      prog[i] = (prog[i] + delta * drive * data.speeds[i]) % 1

      // density modulation: particles bunch (brighten/scale) during ejection
      data.curve.getPointAt(prog[i], dummy.position)

      const inEject = flow > 0.35 && prog[i] > data.ejectFrom
      const sc = data.sizes[i] * (inEject ? 1.45 : 0.9) *
                 (data.circuit === 'systemic' ? (0.6 + 0.8 * s.contractLV) : (0.6 + 0.8 * s.contractRV))
      dummy.scale.setScalar(visible ? Math.max(sc, 0.0001) : 0.0001)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[null, null, data.count]} frustumCulled={false}>
      <sphereGeometry args={[0.028, 10, 10]} />
      <meshBasicMaterial
        color={data.color}
        transparent
        opacity={0.92}
        toneMapped={false}
      />
    </instancedMesh>
  )
}

export default function BloodFlowParticles({ infarct = 0 }) {
  const left = useMemo(() => makeStream(COUNT_LEFT, COLOR_O2, LEFT_WAYPOINTS, {
    count: COUNT_LEFT, circuit: 'systemic', sizeBase: 1.0,
    ejectFrom: 0.42,   // particles past LV apex ride the ejection pulse
  }), [])

  const right = useMemo(() => makeStream(COUNT_RIGHT, COLOR_DE, RIGHT_WAYPOINTS, {
    count: COUNT_RIGHT, circuit: 'pulmonary', sizeBase: 1.05,
    ejectFrom: 0.40,
  }), [])

  return (
    <group>
      <Stream data={left} />
      <Stream data={right} />
    </group>
  )
}
