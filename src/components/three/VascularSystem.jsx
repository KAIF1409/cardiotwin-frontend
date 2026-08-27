/**
 * VascularSystem.jsx  —  INTERACTIVE VASCULAR TREE  (Phase 1 · §1 vessels)
 * ═══════════════════════════════════════════════════════════════════════
 * Builds an anatomical TubeGeometry network from anatomyRegistry PATHS:
 *   SVC · IVC · Pulmonary trunk & branches · Pulmonary veins ·
 *   Ascending/Arch/Descending Aorta · Coronaries (LAD, Diagonal, RCA)
 *
 * INTERACTIVITY CONTRACT (spec §2.3)
 *   • Every vessel is a live mesh: onPointerOver → cyan/crimson emissive
 *     rim-glow + floating anatomical name badge + brightens its blood-
 *     flow particle stream via flowBus (opposite circuit dims).
 *   • onPointerDown   → smooth CameraControls tween onto the vessel.
 *   • Coronaries additionally pulse their emissive with LV contraction,
 *     synced to the master cardiac clock like everything else.
 *
 * MATERIALS (spec §1.2): MeshPhysicalMaterial  roughness 0.30 ·
 * transmission 0.10 · clearcoat 0.50 — living wet-tissue translucency.
 */

import { useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { getEngineState } from '../../simulation/cardiacEngine'
import {
  PATHS, getPathCurve, flowBus,
} from '../../data/anatomyRegistry'

// Rim-glow colours per circuit (spec palette)
const GLOW = {
  systemic:  new THREE.Color('#FF2E93'),   // crimson rim — oxygenated side
  pulmonary: new THREE.Color('#00F2FE'),   // electric cyan — venous side
}

// ── Shared geometry cache (vessels rebuild never needed across views) ────────
const _tubeCache = new Map()
function getTubeGeometry(p) {
  let g = _tubeCache.get(p.id)
  if (!g) {
    g = new THREE.TubeGeometry(getPathCurve(p.id), 72, p.radius, 14, false)
    _tubeCache.set(p.id, g)
  }
  return g
}

/** One unit sphere reused for every vessel end-cap (scaled per instance). */
const _capGeo = new THREE.SphereGeometry(0.04, 12, 12)

const endPoint = (p, which) =>
  p.pts[which === 'start' ? 0 : p.pts.length - 1]

// ── One interactive vessel ────────────────────────────────────────────────────
function Vessel({ p }) {
  const [hovered, setHovered] = useState(false)
  const baseEmissive = useMemo(() => new THREE.Color('#170202'), [])

  const material = useMemo(() => new THREE.MeshPhysicalMaterial({
    color:              p.color,
    roughness:          0.30,     // spec §1.2
    metalness:          0.05,
    transmission:       0.10,     // spec §1.2
    thickness:          1.4,
    clearcoat:          0.50,     // spec §1.2
    clearcoatRoughness: 0.38,
    sheen:              0.55,
    sheenColor:         new THREE.Color(p.circuit === 'systemic' ? '#ff6a5e' : '#7aa8ff'),
    ior:                1.36,
    emissive:           baseEmissive.clone(),
    emissiveIntensity:  0.35,
  }), [p, baseEmissive])

  // Dispose only what we constructed (never cached geometry)
  useEffect(() => () => material.dispose(), [material])

  const startCap = endPoint(p, 'start')
  const endCap   = endPoint(p, 'end')
  const mid      = useMemo(() => p.pts[Math.floor(p.pts.length / 2)], [p])
  const isCoronary = p.id.startsWith('COR') || p.id === 'COR_DIA'

  // Per-frame emissive breathing: coronaries pulse with LV contraction;
  // hovered vessels light up in their circuit's rim colour (cyan/crimson).
  const glowColor = GLOW[p.circuit]
  useFrame(() => {
    const s = getEngineState()
    const contract = isCoronary ? s.contractLV : (p.circuit === 'systemic' ? s.contractLV : s.contractRV)
    const target   = hovered ? 0.55 + 0.85 * contract : 0.10 + 0.22 * contract
    material.emissive.lerp(hovered ? glowColor : baseEmissive, 0.18)
    material.emissiveIntensity +=
      (target - material.emissiveIntensity) * 0.18
  })

  return (
    <group>
      {/* Main vessel wall */}
      <mesh
        geometry={getTubeGeometry(p)}
        material={material}
        castShadow
        onPointerOver={e => { e.stopPropagation(); setHovered(true); flowBus.focusId = p.id }}
        onPointerOut={() => { setHovered(false); if (flowBus.focusId === p.id) flowBus.focusId = null }}
        onPointerDown={e => {
          e.stopPropagation()
          window.dispatchEvent(new CustomEvent('ct:focus-marker', { detail: p.id }))
        }}
      />
      {/* Endpoint spheres hide open tube bores */}
      {[startCap, endCap].map((c, i) => (
        <mesh key={i} geometry={_capGeo} material={material} position={[c.x, c.y, c.z]}
              scale={p.radius * 24} />
      ))}
      {/* Floating anatomical name badge while hovered */}
      {hovered && (
        <Html position={[mid.x, mid.y + 0.09, mid.z]} center zIndexRange={[40, 30]} style={{ pointerEvents: 'none' }}>
          <div className="an-badge" data-circuit={p.circuit}>
            <span className="an-badge-name">{p.fullName}</span>
            <span className="an-badge-desc">{p.info}</span>
            <span className="an-badge-circuit">
              {p.circuit === 'systemic' ? '🔴 Oxygenated' : '🔵 Deoxygenated'}
            </span>
          </div>
        </Html>
      )}
    </group>
  )
}

export default function VascularSystem() {
  return (
    <group>
      {Object.values(PATHS).filter(p => !p.flowOnly).map(p => (
        <Vessel key={p.id} p={p} />
      ))}
    </group>
  )
}

