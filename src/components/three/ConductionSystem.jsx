/**
 * ConductionSystem.jsx — 3-D ELECTROPHYSIOLOGY OVERLAY
 * ════════════════════════════════════════════════════════
 * Procedural conduction network seated in CARDIAC space (same frame as the
 * heart GLB / valves / vessels), phase-locked to the master engine:
 *
 * SA node ──internodal── AV node ── Bundle of His ── LBB / RBB ── Purkinje
 * P wave ~0.1 s PR delay QRS onset QRS complex
 *
 * Each segment ignites exactly when engine state.conductionNode enters its
 * window (P / PR / QRS onset / QRS), then decays — producing a visible
 * travelling wave. Nodes pulse on fire; the Purkinje web sweeps apex-first
 * (matching real ventricular activation).
 *
 * VISIBILITY: layer toggle `enabled`OR the education PUC NodalConduction
 * lesson (engine conductionOverlay flag) — polled imperatively per frame.
 * Hovering any part shows an isolated anatomical badge (spec §2.3).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { getEngineState, isConductionOverlayOn } from '../../simulation/cardiacEngine'

// Node palette mirrors the PUC NodalConduction lesson rows (visual lock).
const NODES = {
  SA: {
    name: 'SA Node (Pacemaker)',
    wave: 'P wave',
    color: '#FF2E93',
    info: "Fires 60–100/min — the heart's natural pacemaker. Sets the rate for everything downstream."
  },
  AV: {
    name: 'AV Node',
    wave: 'PR segment',
    color: '#F59E0B',
    info: 'The only electrical bridge between atria & ventricles. Delays ~0.1 s so atria finish filling them.'
  },
  HIS: {
    name: 'Bundle of His',
    wave: 'QRS onset',
    color: '#00F2FE',
    info: 'Races down the interventricular septum — the fast highway between atria and ventricles.'
  },
  PURKINJE: {
    name: 'Purkinje Fibres',
    wave: 'QRS complex',
    color: '#10B981',
    info: 'Spreads through ventricular walls → near-simultaneous contraction from the apex upward.'
  }
}

// Anatomy (cardiac units, ≈2-tall heart, viewer-right = patient right)
const SEGMENTS = [
  { id: 'sa_node', node: 'SA', kind: 'node', pos: [0.24, 0.36, 0.0], r: 0.052 },
  { id: 'av_node', node: 'AV', kind: 'node', pos: [0.16, 0.14, 0.0], r: 0.046 },
  { id: 'his_node', node: 'HIS', kind: 'node', pos: [0.0, 0.02, 0.04], r: 0.04 },
  {
    id: 'internodal',
    node: 'AV',
    kind: 'tube',
    win: 'AV',
    pts: [
      [0.24, 0.36, 0.0],
      [0.225, 0.285, -0.02],
      [0.19, 0.205, -0.01],
      [0.16, 0.14, 0.0]
    ]
  },
  {
    id: 'his_path',
    node: 'HIS',
    kind: 'tube',
    win: 'HIS',
    pts: [
      [0.16, 0.14, 0.0],
      [0.08, 0.08, 0.02],
      [0.0, 0.02, 0.04]
    ]
  },
  {
    id: 'lbb',
    node: 'PURKINJE',
    kind: 'tube',
    win: 'PURKINJE',
    pts: [
      [0.0, 0.02, 0.04],
      [-0.06, -0.1, 0.06],
      [-0.12, -0.2, 0.08],
      [-0.16, -0.3, 0.1]
    ]
  },
  {
    id: 'rbb',
    node: 'PURKINJE',
    kind: 'tube',
    win: 'PURKINJE',
    pts: [
      [0.0, 0.02, 0.04],
      [0.06, -0.08, 0.08],
      [0.13, -0.17, 0.1],
      [0.18, -0.26, 0.12]
    ]
  },
  {
    id: 'purk_l1',
    node: 'PURKINJE',
    kind: 'tube',
    win: 'PURKINJE',
    pts: [
      [-0.16, -0.3, 0.1],
      [-0.21, -0.38, 0.13],
      [-0.26, -0.46, 0.15]
    ]
  },
  {
    id: 'purk_l2',
    node: 'PURKINJE',
    kind: 'tube',
    win: 'PURKINJE',
    pts: [
      [-0.16, -0.3, 0.1],
      [-0.13, -0.44, 0.12],
      [-0.09, -0.55, 0.14]
    ]
  },
  {
    id: 'purk_l3',
    node: 'PURKINJE',
    kind: 'tube',
    win: 'PURKINJE',
    pts: [
      [-0.16, -0.3, 0.1],
      [-0.24, -0.34, 0.02],
      [-0.3, -0.4, -0.06]
    ]
  },
  {
    id: 'purk_r1',
    node: 'PURKINJE',
    kind: 'tube',
    win: 'PURKINJE',
    pts: [
      [0.18, -0.26, 0.12],
      [0.23, -0.36, 0.14],
      [0.27, -0.46, 0.15]
    ]
  },
  {
    id: 'purk_r2',
    node: 'PURKINJE',
    kind: 'tube',
    win: 'PURKINJE',
    pts: [
      [0.18, -0.26, 0.12],
      [0.15, -0.42, 0.12],
      [0.11, -0.53, 0.13]
    ]
  },
  {
    id: 'purk_r3',
    node: 'PURKINJE',
    kind: 'tube',
    win: 'PURKINJE',
    pts: [
      [0.18, -0.26, 0.12],
      [0.27, -0.3, 0.03],
      [0.33, -0.36, -0.05]
    ]
  }
]

export default function ConductionSystem({ enabled = false }) {
  const groupRef = useRef()
  const items = useRef([]) // [{seg, mat, mesh, glow, lastHit}]
  const [hover, setHover] = useState(null)

  // One cloned emissive material per segment for isolated glow
  const built = useMemo(
    () =>
      SEGMENTS.map(seg => {
        const color = new THREE.Color(NODES[seg.node].color)
        const mat = new THREE.MeshStandardMaterial({
          color: color.clone().multiplyScalar(0.35),
          emissive: color,
          emissiveIntensity: 0.15,
          roughness: 0.4,
          metalness: 0.05,
          transparent: true,
          opacity: 0.85
        })
        let geometry = null
        if (seg.kind === 'node') {
          geometry = new THREE.SphereGeometry(seg.r, 20, 16)
        } else {
          const curve = new THREE.CatmullRomCurve3(seg.pts.map(p => new THREE.Vector3(...p)))
          geometry = new THREE.TubeGeometry(curve, 32, 0.011, 8, false)
        }
        return { seg, mat, geometry, glow: 0.15, lastHit: -9 }
      }),
    []
  )

  useEffect(
    () => () => {
      built.forEach(b => {
        b.mat.dispose()
        b.geometry.dispose()
      })
    },
    [built]
  )

  useEffect(
    () => () => {
      document.body.style.cursor = 'auto'
    },
    []
  )

  const t0 = useRef(performance.now())

  useFrame(() => {
    const now = (performance.now() - t0.current) / 1000
    // imperative visibility: layer toggle OR education lesson flag
    if (groupRef.current) {
      const want = enabled || isConductionOverlayOn()
      groupRef.current.visible = want
      if (!want) return
    }
    const s = getEngineState()
    const activeNode = s.conductionNode
    built.forEach((b, i) => {
      const hit = b.seg.kind === 'node' ? activeNode === b.seg.node : activeNode === b.seg.win
      if (hit) b.lastHit = now
      // decaying travelling-wave glow (~0.45 s tail)
      const since = now - b.lastHit
      const pulse = hit ? 1.6 : Math.max(0, 1.4 - since * 3.1)
      b.glow += (0.15 + pulse - b.glow) * (hit ? 0.5 : 0.12)
      b.mat.emissiveIntensity = b.glow
      // nodes swell on fire
      const mesh = items.current[i]
      if (mesh && b.seg.kind === 'node') {
        const sc = 1 + 0.35 * Math.max(0, pulse)
        mesh.scale.setScalar(sc)
      }
    })
  })

  const handlers = seg => ({
    onPointerOver: e => {
      e.stopPropagation()
      const meta = NODES[seg.node]
      setHover({ ...meta, key: seg.id })
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => {
      setHover(null)
      document.body.style.cursor = 'auto'
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      {built.map((b, i) => (
        <mesh
          key={b.seg.id}
          ref={el => {
            items.current[i] = el
          }}
          geometry={b.geometry}
          material={b.mat}
          position={b.seg.kind === 'node' ? b.seg.pos : undefined}
          renderOrder={8}
          {...handlers(b.seg)}
        />
      ))}

      {hover && (
        <Html
          position={(() => {
            const seg = SEGMENTS.find(x => x.id === hover.key)
            const p = seg.kind === 'node' ? seg.pos : seg.pts[Math.floor(seg.pts.length / 2)]
            return [p[0], p[1] + 0.1, p[2]]
          })()}
          center
          zIndexRange={[40, 30]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="an-badge" data-circuit="conduction" data-node={hover.key}>
            <span className="an-badge-name" style={{ color: hover.color }}>
              {hover.name} <em style={{ fontStyle: 'normal', opacity: 0.7 }}>· {hover.wave}</em>
            </span>
            <span className="an-badge-desc">{hover.info}</span>
          </div>
        </Html>
      )}
    </group>
  )
}
