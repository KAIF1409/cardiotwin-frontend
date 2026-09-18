/**
 * NcertFlowParticles.jsx — <points> blueprint for the NCERT blood-flow layer
 * ═══════════════════════════════════════════════════════════════════════════
 * DATA SOURCE — the Blender export (generate_ncert_heart.py) embeds the two
 * hidden Bezier guides as empty nodes whose `extras`arrive in three.js as
 * `userData.routes_json`, schema `cardiotwin.bezier.v1`:
 *
 *   [{ id: 'PV0_LA_LV_AO',
 *      segments: [[p0, h1, h2, p1], …] }]     // glTF Y-up METRES, cubic Bézier
 *
 * COORDINATE SPACE — raw GLB metres, identical to the mesh nodes, so this
 * component MUST be mounted as a sibling of the heart clone inside the same
 * normalising <group scale={s}> (NcertHeart.jsx does exactly that).
 *
 * MOTION MODEL — each particle owns (route, phase-offset, speed-jitter) and
 * advances along an arc-length LUT of its route. Speed is governed by the
 * master cardiac engine:
 *
 *   gate(O2) = flowAortic      (0→1 systolic ejection window)
 *   gate(DE) = flowPulmonary   (RV → lungs window)
 *   CO       = SV × HR / 1000  (L/min, from the engine/live packets)
 *   v        = BASE · clamp(CO/5, 0.5, 1.6) · (rest + stroke·gate)
 *
 * so particles visibly surge with ejection and slow in diastole — red
 * #FF0033 (oxygenated) and blue #0055FF (deoxygenated) per FLOW_STYLE spec.
 */

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { onEngineFrame } from '../../simulation/cardiacEngine'

const O2_COLOR = '#FF0033' // FLOW_STYLE.O2_COLOR
const DE_COLOR = '#0055FF' // FLOW_STYLE.DE_COLOR
const LUT_STEPS = 160 // arc-length samples per route
const O2_PER_ROUTE = 24 // 16 oxygenated routes → 384 particles
const DE_PER_ROUTE = 48 // 4 deoxygenated routes → 192 particles
const BASE_SPEED = 0.09 // route loops per second at CO = 5 L/min

/** Radial sprite so points render as glowing corpuscles, not squares. */
let _sprite = null
function spriteTexture() {
  if (_sprite) return _sprite
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.85)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  _sprite = new THREE.CanvasTexture(c)
  return _sprite
}

/**
 * Flatten one route's Bézier segments into an arc-length-uniform position
 * LUT (Float32Array of LUT_STEPS × 3) — O(routes) once, O(1) per particle
 * per frame afterwards.
 */
function buildRouteLUT(segments) {
  const curves = []
  let total = 0
  for (const seg of segments) {
    if (!Array.isArray(seg) || seg.length !== 4) continue
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(...seg[0]),
      new THREE.Vector3(...seg[1]),
      new THREE.Vector3(...seg[2]),
      new THREE.Vector3(...seg[3])
    )
    const len = curve.getLength()
    if (len > 1e-5) {
      curves.push({ curve, len })
      total += len
    }
  }
  if (!curves.length || total <= 0) return null

  const lut = new Float32Array(LUT_STEPS * 3)
  const p = new THREE.Vector3()
  let walked = 0
  for (const { curve, len } of curves) {
    const n = Math.max(2, Math.round((len / total) * LUT_STEPS))
    for (let k = 0; k < n && walked < LUT_STEPS; k++, walked++) {
      curve.getPointAt(k / (n - 1), p)
      lut[walked * 3] = p.x
      lut[walked * 3 + 1] = p.y
      lut[walked * 3 + 2] = p.z
    }
  }
  // Fill any rounding remainder by clamping to the last computed sample.
  for (let i = walked; i < LUT_STEPS; i++) {
    const src = Math.max(0, walked - 1) * 3
    lut[i * 3] = lut[src]
    lut[i * 3 + 1] = lut[src + 1]
    lut[i * 3 + 2] = lut[src + 2]
  }
  return lut
}

/** Circuit builder: LUTs + particle metadata tables + the <points> geometry. */
function buildCircuit(routes, perRoute) {
  const luts = (routes ?? [])
    .map(r => (Array.isArray(r?.segments) ? buildRouteLUT(r.segments) : null))
    .filter(Boolean)
  if (!luts.length) return null

  const count = luts.length * perRoute
  const position = new Float32Array(count * 3)
  const routeIx = new Uint16Array(count)
  const phase = new Float32Array(count)
  const jitter = new Float32Array(count)
  let i = 0
  for (let r = 0; r < luts.length; r++) {
    for (let k = 0; k < perRoute; k++, i++) {
      routeIx[i] = r
      phase[i] = Math.random()
      jitter[i] = 0.8 + Math.random() * 0.4
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10) // skip recompute
  return { luts, count, routeIx, phase, jitter, geometry }
}

/**
 * Mount INSIDE the normalising group (see NcertHeart.jsx). Renders two
 * <points> clouds — oxygenated (red) and deoxygenated (blue) — and updates
 * their position buffers from the master engine clock every frame.
 */
export default function NcertFlowParticles({ routesO2, routesDE }) {
  const o2Ref = useRef(null)
  const deRef = useRef(null)
  const clockRef = useRef(0)
  const lastRef = useRef(0)

  const circuits = useMemo(
    () => ({
      o2: buildCircuit(routesO2, O2_PER_ROUTE),
      de: buildCircuit(routesDE, DE_PER_ROUTE)
    }),
    [routesO2, routesDE]
  )

  // Position-buffer integration on the master cardiac clock.
  useEffect(
    () =>
      onEngineFrame(state => {
        // Frame-rate independent delta (engine state carries no dt).
        const now = performance.now()
        const dt = lastRef.current ? Math.min((now - lastRef.current) / 1000, 0.1) : 0.016
        lastRef.current = now
        clockRef.current += dt
        // Cardiac-output governor: 5 L/min at rest; slam the doors shut
        // outside the ejection/flow windows so particles pulse with the beat.
        const co = Math.max(0.1, (state.sv * state.bpm) / 1000)
        const coFactor = Math.max(0.5, Math.min(1.6, co / 5))
        const speed = {
          o2: BASE_SPEED * coFactor * (0.3 + 0.7 * state.flowAortic),
          de: BASE_SPEED * coFactor * (0.55 + 0.45 * state.flowPulmonary)
        }
        for (const [key, ref] of [
          ['o2', o2Ref],
          ['de', deRef]
        ]) {
          const circuit = circuits[key]
          if (!circuit || !ref.current) continue
          const pos = circuit.geometry.attributes.position
          const arr = pos.array
          const elapsed = clockRef.current
          for (let i = 0; i < circuit.count; i++) {
            const lut = circuit.luts[circuit.routeIx[i]]
            const t = (circuit.phase[i] + elapsed * speed[key] * circuit.jitter[i]) % 1
            const f = t * (LUT_STEPS - 1)
            const i0 = Math.floor(f)
            const i1 = Math.min(LUT_STEPS - 1, i0 + 1)
            const a = f - i0
            const b0 = i0 * 3,
              b1 = i1 * 3,
              o = i * 3
            arr[o] = lut[b0] + (lut[b1] - lut[b0]) * a
            arr[o + 1] = lut[b0 + 1] + (lut[b1 + 1] - lut[b0 + 1]) * a
            arr[o + 2] = lut[b0 + 2] + (lut[b1 + 2] - lut[b0 + 2]) * a
          }
          pos.needsUpdate = true
        }
      }),
    [circuits]
  )

  // Dispose our geometries on unmount (materials/textures are shared).
  useEffect(
    () => () => {
      for (const key of ['o2', 'de']) {
        if (circuits[key]) circuits[key].geometry.dispose()
      }
    },
    [circuits]
  )

  if (!circuits.o2 && !circuits.de) return null

  const shared = {
    size: 0.0042, // GLB-metre space → ≈0.04 world units after scaling
    sizeAttenuation: true,
    map: spriteTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.95
  }

  return (
    <>
      {circuits.o2 && (
        <points ref={o2Ref} frustumCulled={false}>
          <primitive object={circuits.o2.geometry} attach="geometry" />
          <pointsMaterial color={O2_COLOR} {...shared} />
        </points>
      )}
      {circuits.de && (
        <points ref={deRef} frustumCulled={false}>
          <primitive object={circuits.de.geometry} attach="geometry" />
          <pointsMaterial color={DE_COLOR} {...shared} />
        </points>
      )}
    </>
  )
}
