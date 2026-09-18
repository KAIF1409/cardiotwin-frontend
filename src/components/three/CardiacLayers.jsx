/**
 * CardiacLayers.jsx  —  PROCEDURAL DEEP ANATOMY LAYERS
 * ════════════════════════════════════════════════════════
 * Programmatic layer meshes living in CARDIAC (unscaled) space so the
 * anatomy rig in App.js transforms them together with heart + vessels:
 *
 *   • PericardiumSac  — ghost-glass fibroserous sac enclosing the heart
 *   • InnerChambers   — four endocardial shells (LA RA LV RV), translucent
 *                       so they read through the myocardial wall
 *   • ValveSet        — Tricuspid · Mitral(bicuspid) · Aortic · Pulmonary
 *                       annuli whose leaflets OPEN/CLOSE on engine phase
 *
 * Every part is INTERACTIVE per spec §2.3: hover → emissive lift + isolated
 * anatomical badge; click → ct:focus-marker camera tween.
 *
 * Pure procedural geometry: even when an external GLB heart loads WITHOUT
 * separable valves/chambers, this group supplies them (dynamic fallback
 * mesh generation requirement).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { getEngineState } from '../../simulation/cardiacEngine'
import { VALVE_DEFS } from '../../data/anatomyRegistry'

const _q = new THREE.Quaternion()
const _Z = new THREE.Vector3(0, 0, 1)
const WHITE = new THREE.Color('#ffffff')

// ─── shared hover plumbing ──────────────────────────────────────────────────
// `enabled` is false by default: the model must read as a clean object until
// the operator deliberately turns labels on. No cursor swaps, no badges.
function useHoverBadge(enabled = false) {
  const [hover, setHover] = useState(null)
  useEffect(
    () => () => {
      document.body.style.cursor = 'auto'
    },
    []
  )
  const handlers = marker =>
    enabled
      ? {
          onPointerOver: e => {
            e.stopPropagation()
            setHover(marker)
            document.body.style.cursor = 'pointer'
          },
          onPointerOut: e => {
            e.stopPropagation()
            setHover(h => (h && h.id === marker.id ? null : h))
            document.body.style.cursor = 'auto'
          },
          onPointerDown: e => {
            e.stopPropagation()
            window.dispatchEvent(new CustomEvent('ct:focus-marker', { detail: marker.id }))
          }
        }
      : {}
  return { hover: enabled ? hover : null, handlers }
}

function HoverBadge({ hover }) {
  if (!hover) return null
  const p = Array.isArray(hover.pos) ? hover.pos : [hover.pos.x, hover.pos.y, hover.pos.z]
  return (
    <Html
      position={[p[0], p[1] + 0.14, p[2]]}
      center
      zIndexRange={[40, 30]}
      style={{ pointerEvents: 'none' }}
    >
      <div className="an-badge" data-circuit={hover.circuit ?? 'chamber'}>
        <span className="an-badge-name">{hover.fullName}</span>
        <span className="an-badge-desc">{hover.info}</span>
      </div>
    </Html>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// PERICARDIUM SAC
// ═════════════════════════════════════════════════════════════════════════════
const PERI_MARKER = {
  id: 'pericardium',
  fullName: 'Pericardium',
  pos: [0, 0.05, 0.6],
  circuit: 'sac',
  info: 'Tough fibrous sac + serous lubricated lining — anchors the heart in the mediastinum and prevents over-expansion.'
}

export function PericardiumSac({ interactive = false }) {
  const matRef = useRef()
  const { hover, handlers } = useHoverBadge(interactive)

  useEffect(() => {
    const m = matRef.current
    return () => m?.dispose()
  }, [])

  useFrame(() => {
    const s = getEngineState()
    const m = matRef.current
    if (!m) return
    const targetOp = hover ? 0.34 : 0.15
    m.opacity += (targetOp - m.opacity) * 0.12
    m.emissiveIntensity = hover ? 1.2 : 0.35 + 0.9 * s.contractLV
  })

  return (
    <group scale={[0.7, 0.95, 0.68]} position={[0, 0.06, 0]} {...handlers(PERI_MARKER)}>
      <mesh renderOrder={3}>
        <sphereGeometry args={[1.18, 48, 36]} />
        <meshPhysicalMaterial
          ref={matRef}
          color="#9fd8ff"
          roughness={0.22}
          metalness={0}
          transmission={0.72}
          thickness={1.8}
          ior={1.32}
          clearcoat={0.9}
          clearcoatRoughness={0.2}
          sheen={1}
          sheenColor={new THREE.Color('#7cd4ff')}
          transparent
          opacity={0.15}
          depthWrite={false}
          side={THREE.DoubleSide}
          emissive={new THREE.Color('#123a52')}
        />
      </mesh>
      <HoverBadge hover={hover} />
    </group>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// INNER CHAMBERS — four endocardial shells (coordinates match LABEL_ANCHORS)
// ═════════════════════════════════════════════════════════════════════════════
const CHAMBER_SHELLS = [
  {
    id: 'LA',
    fullName: 'Left Atrium cavity',
    pos: [-0.28, 0.26, -0.16],
    r: [0.3, 0.27, 0.29],
    color: '#ab47bc',
    info: 'Receives oxygenated blood from four pulmonary veins; dilates when LA pressure chronically rises.'
  },
  {
    id: 'RA',
    fullName: 'Right Atrium cavity',
    pos: [0.28, 0.26, -0.11],
    r: [0.3, 0.28, 0.3],
    color: '#ef5350',
    info: 'Systemic venous reservoir — receives SVC / IVC return plus the coronary sinus.'
  },
  {
    id: 'LV',
    fullName: 'Left Ventricle cavity',
    pos: [-0.3, -0.26, 0.1],
    r: [0.33, 0.46, 0.31],
    color: '#00bcd4',
    info: 'Thick-walled high-pressure pump — its cavity obliterates ~60% at systole.'
  },
  {
    id: 'RV',
    fullName: 'Right Ventricle cavity',
    pos: [0.27, -0.2, 0.14],
    r: [0.31, 0.4, 0.3],
    color: '#ff9800',
    info: 'Crescent-shaped low-pressure pump wrapped around the LV — ejects into the pulmonary circuit.'
  }
]

export function InnerChambers({ interactive = false }) {
  const mats = useRef([])
  const baseCols = useMemo(() => CHAMBER_SHELLS.map(c => new THREE.Color(c.color)), [])
  const { hover, handlers } = useHoverBadge(interactive)

  useEffect(() => () => mats.current.forEach(m => m?.dispose()), [])

  useFrame(() => {
    const s = getEngineState()
    CHAMBER_SHELLS.forEach((c, i) => {
      const m = mats.current[i]
      if (!m) return
      const isVentricle = c.id === 'LV' || c.id === 'RV'
      const pump = isVentricle ? (s.contractRV ?? s.contractLV) : 1 - s.contractLV
      const hovered = hover?.id === c.id
      m.emissive.lerp(hovered ? WHITE : baseCols[i], 0.15)
      m.emissiveIntensity += ((hovered ? 0.85 : 0.16 + 0.55 * pump) - m.emissiveIntensity) * 0.15
      m.opacity += ((hovered ? 0.55 : 0.3) - m.opacity) * 0.12
    })
  })

  return (
    <group>
      {CHAMBER_SHELLS.map((c, i) => (
        <group key={c.id} position={c.pos} {...handlers(c)}>
          <mesh renderOrder={5} scale={c.r}>
            <sphereGeometry args={[1, 42, 32]} />
            <meshPhysicalMaterial
              ref={el => {
                mats.current[i] = el
              }}
              color={c.color}
              roughness={0.25}
              metalness={0.02}
              transmission={0.45}
              thickness={1.1}
              clearcoat={0.6}
              sheen={0.8}
              sheenColor={new THREE.Color(c.color)}
              transparent
              opacity={0.3}
              depthWrite={false}
              emissive={new THREE.Color(c.color)}
              emissiveIntensity={0.2}
            />
          </mesh>
        </group>
      ))}
      <HoverBadge hover={hover} />
    </group>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// VALVE SET — Tricuspid · Mitral · Aortic · Pulmonary (procedural fallback)
//   Annulus torus + N leaflets whose swing angle tracks the ENGINE PHASE:
//     AV valves   open during filling   (φ ≥ 0.46 ∪ φ < 0.14)
//     Semilunar   open during ejection  (0.20 ≤ φ < 0.46)
// ═════════════════════════════════════════════════════════════════════════════
function Valve({ def, interactive = false }) {
  const leafRefs = useRef([])
  const matRef = useRef()
  const { hover, handlers } = useHoverBadge(interactive)
  const petalCount = def.kind === 'av' ? 2 : 3

  // Orient the annulus plane ⟂ to its anatomical normal
  const quat = useMemo(
    () => _q.setFromUnitVectors(_Z, new THREE.Vector3(...def.normal).normalize()).clone(),
    [def]
  )
  useEffect(() => () => matRef.current?.dispose(), [])

  useFrame(() => {
    const p = getEngineState().phase
    const isOpen = def.kind === 'av' ? p >= 0.46 || p < 0.14 : p >= 0.2 && p < 0.46
    // swing: −1.12 rad ≈ wide open, −0.10 rad ≈ sealed shut
    const target = (isOpen ? -1.12 : -0.1) + (hover ? (isOpen ? -0.15 : 0.05) : 0)
    leafRefs.current.forEach((leaf, i) => {
      if (!leaf) return
      leaf.rotation.x += (target - leaf.rotation.x) * 0.25
      leaf.position.y += (target * def.R * 0.22 - leaf.position.y) * 0.25
    })
    const m = matRef.current
    if (m) {
      m.emissive.lerp(hover ? WHITE : baseColorOf(def), 0.15)
      m.emissiveIntensity += ((hover ? 0.9 : 0.25) - m.emissiveIntensity) * 0.15
      m.opacity += ((hover ? 0.85 : 0.62) - m.opacity) * 0.12
    }
  })

  return (
    <group position={def.pos} quaternion={quat} {...handlers(def)}>
      {/* fibrous annulus ring */}
      <mesh>
        <torusGeometry args={[def.R, 0.016, 10, 44]} />
        <meshStandardMaterial color="#e8dcc8" roughness={0.4} metalness={0.05} />
      </mesh>

      {/* translucent valve body */}
      <mesh renderOrder={6}>
        <circleGeometry args={[def.R * 0.98, 36]} />
        <meshPhysicalMaterial
          ref={matRef}
          color={def.color}
          roughness={0.18}
          metalness={0}
          clearcoat={0.9}
          transmission={0.35}
          thickness={0.5}
          transparent
          opacity={0.62}
          depthWrite={false}
          side={THREE.DoubleSide}
          emissive={new THREE.Color(def.color)}
          emissiveIntensity={0.25}
        />
      </mesh>

      {/* animated leaflets hinged around the rim */}
      {Array.from({ length: petalCount }).map((_, i) => (
        <group
          key={i}
          ref={el => {
            leafRefs.current[i] = el
          }}
        >
          <mesh renderOrder={7}>
            <circleGeometry
              args={[
                def.R * 0.94,
                20,
                Math.PI + i * (Math.PI / petalCount),
                (Math.PI * 0.8) / petalCount
              ]}
            />
            <meshPhysicalMaterial
              color="#fff6f4"
              roughness={0.15}
              clearcoat={1}
              transparent
              opacity={0.75}
              side={THREE.DoubleSide}
              depthWrite={false}
              emissive="#ffffff"
              emissiveIntensity={0.08}
            />
          </mesh>
        </group>
      ))}

      {hover && (
        <Html center zIndexRange={[40, 30]} style={{ pointerEvents: 'none' }}>
          <div className="an-badge" data-circuit="valve">
            <span className="an-badge-name">{def.fullName}</span>
            <span className="an-badge-desc">{def.info}</span>
          </div>
        </Html>
      )}
    </group>
  )
}

const _valveCols = new Map(VALVE_DEFS.map(v => [v.id, new THREE.Color(v.color)]))
const baseColorOf = def => _valveCols.get(def.id)

export function ValveSet({ interactive = false }) {
  return (
    <group>
      {VALVE_DEFS.map(v => (
        <Valve key={v.id} def={v} interactive={interactive} />
      ))}
    </group>
  )
}

export default function CardiacLayersRoot() {
  return null
} // named imports only
