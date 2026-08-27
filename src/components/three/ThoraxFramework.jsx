/**
 * ThoraxFramework.jsx  —  PROCEDURAL GLASS THORACIC SKELETON
 * ══════════════════════════════════════════════════════════
 * Real anatomical scale context around the cardiac organs (spec §1.1):
 *
 *   • 12 pairs of curved ribs sweeping spine → lateral barrel → sternum
 *     (true ribs 1–7 gain translucent costal cartilage tips)
 *   • Manubrium · sternal body · xiphoid  (rounded breastplate)
 *   • Thoracic vertebrae T1–T12 with intervertebral discs
 *   • Clavicles capping the thoracic inlet
 *
 * STYLE: ghost-glass ivory bone — MeshPhysicalMaterial transmission 0.42,
 * opacity 0.30, clearcoat 0.6 — lets the glowing myocardium shine through
 * like a commercial medical-twin render while keeping real cage geometry.
 *
 * EVERY BONE IS INTERACTIVE (spec §2.3):
 *   hover → cool bone-white emissive lift + floating name badge
 *   click → CameraControls tween onto that bone (ct:focus-marker bus)
 */

import { useEffect, useMemo, useState, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { buildThorax } from '../../data/anatomyRegistry'

// ── Material factory (one cloned material per bone for local glow) ──────────
function makeBoneMaterial(kind) {
  const cartilage = kind === 'cartilage'
  const disc      = kind === 'disc'
  return new THREE.MeshPhysicalMaterial({
    color:              disc ? '#b8b2a2' : cartilage ? '#cdd6f4' : '#E9E3D1',
    roughness:          disc ? 0.5 : 0.36,
    metalness:          0.02,
    transmission:       cartilage ? 0.55 : 0.42,
    thickness:          0.9,
    clearcoat:          0.60,
    clearcoatRoughness: 0.30,
    ior:                1.45,
    transparent:        true,
    opacity:            disc ? 0.24 : cartilage ? 0.20 : 0.30,
    depthWrite:         false,
    emissive:           new THREE.Color('#151207'),
    emissiveIntensity:  0.25,
  })
}

/** Shared capsule-ish tube geometry cache per rib curve object identity */
const _ribGeoCache = new WeakMap()
function getRibGeometry(bone) {
  let g = _ribGeoCache.get(bone.curve)
  if (!g) {
    g = new THREE.TubeGeometry(bone.curve, 46, bone.radius, 10, false)
    _ribGeoCache.set(bone.curve, g)
  }
  return g
}
const _cartGeoCache = new WeakMap()
function getCartGeometry(bone) {
  if (!bone.cartilagePts) return null
  let g = _cartGeoCache.get(bone.curve)
  if (!g) {
    const c = new THREE.CatmullRomCurve3(bone.cartilagePts)
    g = new THREE.TubeGeometry(c, 18, bone.cartRadius, 8, false)
    _cartGeoCache.set(bone.curve, g)
  }
  return g
}
const _clavGeoCache = new WeakMap()

// ── Component ─────────────────────────────────────────────────────────────────
export default function ThoraxFramework({ visible = true }) {
  const bones    = useMemo(buildThorax, [])
  const ribs     = useMemo(() => bones.filter(b => b.kind === 'rib'),      [bones])
  const sterna   = useMemo(() => bones.filter(b => b.kind === 'sternum'),  [bones])
  const vertebrae= useMemo(() => bones.filter(b => b.kind === 'vertebra'), [bones])
  const clavs    = useMemo(() => bones.filter(b => b.kind === 'clavicle'), [bones])

  const [hover, setHover] = useState(null)
  const groupRef = useRef()

  // One cloned physical material per bone ⇒ isolated hover glow, batched dispose
  const matMap = useMemo(() => {
    const m = new Map()
    bones.forEach(b => m.set(b.id, makeBoneMaterial('bone')))
    const cart = new Map()
    ribs.forEach(b => { if (b.cartilagePts) cart.set(b.id, makeBoneMaterial('cartilage')) })
    return { bone: m, cart }
  }, [bones, ribs])

  useEffect(() => () => {
    matMap.bone.forEach(m => m.dispose())
    matMap.cart.forEach(m => m.dispose())
  }, [matMap])

  const HOVER_EMISSIVE = useMemo(() => new THREE.Color('#cfe6ff'), [])
  const BASE_EMISSIVE  = useMemo(() => new THREE.Color('#151207'), [])

  // Per-frame glow easing toward the hovered bone + gentle respiratory drift
  useFrame(state => {
    const t = state.clock.elapsedTime
    if (groupRef.current) {
      const breathe = 1 + 0.006 * Math.sin(t * 2 * Math.PI * 0.23)   // ~14 breaths/min
      groupRef.current.scale.setScalar(breathe)
    }
    matMap.bone.forEach((m, id) => {
      const active = hover && (hover.id === id)
      m.emissive.lerp(active ? HOVER_EMISSIVE : BASE_EMISSIVE, 0.15)
      const target = active ? 0.8 : 0.25
      m.emissiveIntensity += (target - m.emissiveIntensity) * 0.15
    })
  })

  // Pointer plumbing for every bone mesh
  const handlersFor = marker => ({
    onPointerOver: e => {
      e.stopPropagation()
      setHover(marker)
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => {
      setHover(h => (h && h.id === marker.id ? null : h))
      document.body.style.cursor = 'auto'
    },
    onPointerDown: e => {
      e.stopPropagation()
      window.dispatchEvent(new CustomEvent('ct:focus-marker', { detail: marker.id }))
    },
  })

  useEffect(() => () => { document.body.style.cursor = 'auto' }, [])

  return (
    <group ref={groupRef} visible={visible}>
      {/* ── Ribs (+ translucent costal cartilage for true ribs) ── */}
      {ribs.map(b => (
        <group key={b.id} {...handlersFor(b.marker)}>
          <mesh geometry={getRibGeometry(b)}  material={matMap.bone.get(b.id)} />
          {b.cartilagePts && getCartGeometry(b) && (
            <mesh geometry={getCartGeometry(b)} material={matMap.cart.get(b.id)} />
          )}
        </group>
      ))}

      {/* ── Sternum segments — rounded glass plates ── */}
      {sterna.map(S => (
        <RoundedBox
          key={S.id}
          args={[S.box.size[0], S.box.size[1], S.box.size[2]]}
          radius={0.024}
          smoothness={4}
          position={[S.box.pos[0], S.box.pos[1], S.box.pos[2]]}
          material={matMap.bone.get(S.id)}
          {...handlersFor(S.marker)}
        />
      ))}

      {/* ── Vertebral bodies + spinous processes + discs ── */}
      {vertebrae.map(VB => (
        <group key={VB.id} {...handlersFor(VB.marker)}>
          <mesh position={VB.pos} material={matMap.bone.get(VB.id)}>
            <cylinderGeometry args={[0.085, 0.085, 0.17, 10]} />
          </mesh>
          <mesh
            position={[VB.pos[0], VB.pos[1], VB.pos[2] - 0.20]}
            rotation={[Math.PI / 2, 0, 0]}
            material={matMap.bone.get(VB.id)}
          >
            <coneGeometry args={[0.034, 0.26, 8]} />
          </mesh>
          <mesh position={[0, VB.discY, VB.pos[2]]}>
            <cylinderGeometry args={[0.07, 0.07, 0.045, 10]} />
            <meshStandardMaterial color="#5a5f74" roughness={0.7} transparent opacity={0.35} depthWrite={false} />
          </mesh>
        </group>
      ))}

      {/* ── Clavicles capping the thoracic inlet ── */}
      {clavs.map(C => {
        let g = _clavGeoCache.get(C.curve)
        if (!g) {
          g = new THREE.TubeGeometry(C.curve, 32, C.radius, 10, false)
          _clavGeoCache.set(C.curve, g)
        }
        return (
          <mesh key={C.id} geometry={g} material={matMap.bone.get(C.id)} {...handlersFor(C.marker)} />
        )
      })}

      {/* Single shared anatomical badge for whichever bone is hovered */}
      {hover && (
        <Html
          position={[hover.pos.x, hover.pos.y + 0.1, hover.pos.z]}
          center
          zIndexRange={[40, 30]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="an-badge" data-circuit="bone">
            <span className="an-badge-name">{hover.fullName}</span>
            <span className="an-badge-desc">{hover.desc}</span>
          </div>
        </Html>
      )}
    </group>
  )
}
