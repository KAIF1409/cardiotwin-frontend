/**
 * HeartModel.jsx  —  v2 (MASTER CLOCK + PBR EDITION)
 * ══════════════════════════════════════════════════
 * Full-heart GLB viewer.
 *
 * FIXES vs v1
 *  • Contraction now reads the MASTER engine phase — identical clock as
 *    ECG / PV loop / strain, so QRS peak = maximal contraction exactly.
 *  • PBR tissue material: MeshPhysicalMaterial with clearcoat + sheen +
 *    warm subsurface-tint emissive → wet muscle look, not flat plastic.
 *  • WEBGL MEMORY LEAK FIXED: v1 disposed geometries of the CACHED GLTF
 *    scene on unmount. useGLTF shares those buffers across views, so the
 *    next mount re-uploaded fresh GPU copies every switch (leak). Now we
 *    only dispose materials we cloned ourselves.
 *  • Auto-normalises scale/center for arbitrary patient meshes.
 */

import { useRef, useEffect, useMemo, useState, Suspense, Component } from 'react'
import { useGLTF } from '@react-three/drei'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { onEngineFrame } from '../simulation/cardiacEngine'

// Tissue palette
const TISSUE = {
  base: new THREE.Color('#9e2b25'),
  sssTint: new THREE.Color('#ff6a5e'),
  deep: new THREE.Color('#5c120f')
}

/** Apply clinical-glass PBR material to every mesh in a scene. */
export function applyTissueMaterial(scene, { opacity = 1, color } = {}) {
  scene.traverse(child => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true

    const mat = new THREE.MeshPhysicalMaterial({
      color: color ?? TISSUE.base,
      roughness: 0.3, // spec §1.2
      metalness: 0.02,
      transmission: 0.1, // spec §1.2 — living tissue translucency
      thickness: 1.6,
      ior: 1.38,
      clearcoat: 0.5, // spec §1.2
      clearcoatRoughness: 0.35,
      sheen: 0.6,
      sheenColor: new THREE.Color('#ff8a7a'),
      emissive: TISSUE.deep,
      emissiveIntensity: 0.22,
      transparent: opacity < 1,
      opacity
    })
    if (child.material) {
      // keep any baked vertex colours / maps where present
      if (child.material.map) mat.map = child.material.map
      if (child.material.normalMap) mat.normalMap = child.material.normalMap
    }
    child.material = mat
    if (child.geometry && !child.geometry.attributes.normal?.array) {
      child.geometry.computeVertexNormals()
    }
  })
}

/**
 * HEART-MESH PART CLASSIFICATION (hover isolation)
 * Each mesh in the (normalized) cardiac scene is mapped to one anatomical
 * region so raycast hovering can highlight a single chamber — not the
 * entire organ. Name hints from patient meshes win; centroid zones fall back.
 */
const PART_META = {
  LV: {
    fullName: 'Left Ventricle',
    color: '#00bcd4',
    desc: 'Main pumping chamber — sends oxygenated blood to the body'
  },
  RV: {
    fullName: 'Right Ventricle',
    color: '#ff9800',
    desc: 'Pumps deoxygenated blood to the lungs'
  },
  LA: {
    fullName: 'Left Atrium',
    color: '#ab47bc',
    desc: 'Receives oxygenated blood from the lungs'
  },
  RA: {
    fullName: 'Right Atrium',
    color: '#ef5350',
    desc: 'Receives deoxygenated blood from the body'
  },
  MYO: {
    fullName: 'Myocardium',
    color: '#ff6e6e',
    desc: 'Heart-wall muscle — thickness reflects hypertrophy or damage'
  }
}

const PART_NAME_HINTS = [
  [/lv|left[\s_-]*vent/i, 'LV'],
  [/rv|right[\s_-]*vent/i, 'RV'],
  [/la\b|left[\s_-]*atri|^lau?m\b/i, 'LA'],
  [/ra\b|right[\s_-]*atri|^ram\b/i, 'RA']
]

const PART_ZONES = [
  { id: 'LA', p: [-0.28, 0.26, -0.1], r: 0.5 },
  { id: 'RA', p: [0.28, 0.26, -0.08], r: 0.5 },
  { id: 'LV', p: [-0.33, -0.3, 0.12], r: 0.64 },
  { id: 'RV', p: [0.3, -0.25, 0.16], r: 0.64 }
]

function classifyPart(mesh) {
  const name = mesh?.name || ''
  for (const [re, id] of PART_NAME_HINTS) if (re.test(name)) return id
  try {
    const box = new THREE.Box3().setFromObject(mesh)
    const c = box.getCenter(new THREE.Vector3())
    let best = 'MYO',
      bestD = Infinity
    for (const z of PART_ZONES) {
      const d = c.distanceToSquared(new THREE.Vector3(...z.p))
      if (d < z.r * z.r && d < bestD) {
        best = z.id
        bestD = d
      }
    }
    return best
  } catch {
    return 'MYO'
  }
}

/** Animate part-highlight materials in/out without React re-renders. */
function liftParts(meshes, on, colorHex) {
  meshes.forEach(m => {
    const mat = m.material
    if (!mat || !mat.emissive) return
    mat.userData._baseEmi ??= mat.userData._baseEmi ?? {
      color: mat.emissive.clone(),
      i: mat.emissiveIntensity
    }
    mat.emissive.set(on ? colorHex : mat.userData._baseEmi.color)
    mat.emissiveIntensity = on ? 0.85 : mat.userData._baseEmi.i
  })
}

// ─────────────────────────────────────────────────────────────
// PROCEDURAL FALLBACK — used while the GLB streams AND forever if
// loading fails (error boundary). Never leaves a blank stage.
// ─────────────────────────────────────────────────────────────
let _fallbackGeoCache = null
function getFallbackGeometry() {
  if (_fallbackGeoCache) return _fallbackGeoCache
  const g = new THREE.SphereGeometry(1, 56, 44)
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const pinch = 0.42 + 0.58 * Math.min(1, (v.y + 1) * 0.85) // apex taper
    const bulgeL = Math.exp(-((v.x + 0.34) ** 2 + (v.y - 0.52) ** 2 + (v.z * 0.8) ** 2) / 0.1)
    const bulgeR = Math.exp(-((v.x - 0.37) ** 2 + (v.y - 0.49) ** 2 + (v.z * 0.8) ** 2) / 0.11)
    v.x *= pinch * (1 + 0.045 * Math.sin(v.y * 6 + v.x * 2))
    v.z *= pinch * (1 + 0.03 * Math.cos(v.y * 5))
    v.y *= 1.1
    v.y += (bulgeL + bulgeR) * 0.3 // atrial bulges
    v.y -= 0.1 * Math.max(0, -v.y - 0.3) ** 1.6 // gentle drip toward apex
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  _fallbackGeoCache = g
  return g
}

function ProceduralHeart({ opacity = 1 }) {
  const geo = useMemo(getFallbackGeometry, [])
  useEffect(() => () => {}, []) // geometry cached module-level, nothing owned
  return (
    <mesh geometry={geo} castShadow>
      <meshPhysicalMaterial
        color={TISSUE.base}
        roughness={0.3}
        metalness={0.02}
        transmission={0.1}
        thickness={1.6}
        clearcoat={0.5}
        sheen={0.6}
        sheenColor={new THREE.Color('#ff8a7a')}
        emissive={TISSUE.deep}
        emissiveIntensity={0.22}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  )
}

class GLTFBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err) {
    console.warn('HeartModel: GLTF failed → procedural fallback', err?.message)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function HeartMesh({ scene, baseScale, tissueOpacity = 1, showEduTags = false }) {
  const modelRef = useRef()
  const innerRef = useRef() // contraction target — sibling vasculature
  // rendered in the same outer group NEVER squeezes
  const rootRef = useRef()
  const tipRef = useRef()
  const partsRef = useRef(new Map())
  const hoveredRef = useRef(null)
  const _wp = useRef(new THREE.Vector3())

  // Hover state — isolated per-part tooltip metadata
  const [hoverId, setHoverId] = useState(null)

  // Clone scene safely once (+ whenever requested wall opacity changes)
  const clonedScene = useMemo(() => {
    const c = scene.clone(true)
    c.position.set(0, 0, 0)
    c.rotation.set(0, 0, 0)

    const box = new THREE.Box3().setFromObject(c)
    const size = new THREE.Vector3()
    box.getSize(size)
    const center = new THREE.Vector3()
    box.getCenter(center)
    const maxAxis = Math.max(size.x, size.y, size.z)
    if (!maxAxis || maxAxis <= 0) return c

    const s = 2 / maxAxis
    c.scale.setScalar(s)
    c.position.set(-center.x * s, -center.y * s, -center.z * s)

    applyTissueMaterial(c, { opacity: tissueOpacity })

    // ── Per-mesh anatomical classification for isolated hover highlight ──
    partsRef.current = new Map()
    c.traverse(node => {
      if (!node.isMesh) return
      const id = classifyPart(node)
      node.userData.partId = id
      if (!partsRef.current.has(id)) partsRef.current.set(id, [])
      partsRef.current.get(id).push(node)
    })
    return c
  }, [scene, tissueOpacity])

  // Dispose ONLY what we created (materials) — never cached geometry.
  useEffect(
    () => () => {
      clonedScene.traverse(child => {
        if (child.isMesh && child.material?.isMeshPhysicalMaterial) {
          child.material.dispose()
        }
      })
    },
    [clonedScene]
  )

  // Clear cursor + highlight on unmount
  useEffect(
    () => () => {
      document.body.style.cursor = 'auto'
    },
    []
  )

  const setPartHover = id => {
    if (hoveredRef.current === id) return
    if (hoveredRef.current && hoveredRef.current !== id) {
      liftParts(partsRef.current.get(hoveredRef.current) || [], false)
    }
    hoveredRef.current = id
    if (id) liftParts(partsRef.current.get(id) || [], true, PART_META[id].color)
    setHoverId(id)
  }

  const handleOver = e => {
    // Inspect mode only — with labels OFF the viewer gets a clean model
    // and zero overlays on hover (platform default).
    if (!showEduTags) return
    e.stopPropagation()
    const id = e.object?.userData?.partId || 'MYO'
    setPartHover(id)
    if (tipRef.current && rootRef.current) {
      _wp.current.copy(e.point)
      rootRef.current.worldToLocal(_wp.current)
      tipRef.current.position.copy(_wp.current)
    }
    document.body.style.cursor = 'pointer'
  }

  // Leaving inspect mode must also drop any live hover highlight
  useEffect(() => {
    if (!showEduTags && hoveredRef.current) setPartHover(null)
  }, [showEduTags])

  const handleOut = () => {
    setPartHover(null)
    document.body.style.cursor = 'auto'
  }

  // ── Master-clock contraction (inner group ONLY) ──
  useEffect(() => {
    return onEngineFrame(s => {
      if (!innerRef.current) return
      // contractLV: 0 (diastole) → ~1 (peak systole), dampened by infarct
      const k = s.contractLV
      // smooth pulse: scale dips inward during systole
      const pulse = baseScale * (1 - 0.14 * k)
      innerRef.current.scale.setScalar(pulse)
      // subtle twist for realism (apex rotates slightly against base)
      innerRef.current.rotation.z = -0.03 * k
    })
  }, [baseScale])

  const meta = hoverId ? PART_META[hoverId] : null

  return (
    <group ref={rootRef}>
      <group ref={innerRef}>
        <primitive
          ref={modelRef}
          object={clonedScene}
          dispose={null}
          onPointerOver={handleOver}
          onPointerMove={e => {
            if (!showEduTags) return
            if (tipRef.current && rootRef.current) {
              _wp.current.copy(e.point)
              rootRef.current.worldToLocal(_wp.current)
              tipRef.current.position.copy(_wp.current)
            }
          }}
          onPointerOut={handleOut}
        />
      </group>

      {/* Inspect-mode badge — mounted only while the Labels toggle is on */}
      {showEduTags && meta && (
        <group ref={tipRef}>
          <Html center zIndexRange={[42, 32]} style={{ pointerEvents: 'none' }}>
            <div
              className="an-badge heart-hover-badge"
              data-circuit={hoverId === 'MYO' ? 'myo' : 'chamber'}
              data-part={hoverId}
            >
              <span className="an-badge-name" style={{ color: meta.color }}>
                {PART_META[hoverId].fullName}
              </span>
              <span className="an-badge-desc">{meta.desc}</span>
            </div>
          </Html>
        </group>
      )}
    </group>
  )
}

// ─────────────────────────────────────────────────────────────
// MODEL LOADER + ERROR BOUNDARY
// ─────────────────────────────────────────────────────────────

function ModelLoader(props) {
  const gltf = useGLTF(props.url)
  if (!gltf?.scene) return null
  return <HeartMesh {...props} scene={gltf.scene} />
}

export default function HeartModel({
  baseScale = 1,
  heartRate = 72, // kept for API compat — engine owns timing now
  onBeat,
  customURL,
  heartGroupRef,
  tissueOpacity = 1, // dropped to ~0.55 when Inner-Chambers layer is ON
  showEduTags = false, // NCERT <Html> educational tags (labels toggle)
  onSelectPart // tag click → App-level lesson focus
}) {
  // ── PIPELINE SELECTION ──────────────────────────────────────────────────
  //   Patient upload (customURL)   → legacy patient-mesh pipeline
  //   Default                      → OPEN-SOURCE heart model from the repo:
  //     "/models/heart.glb"= Sketchfab "Realistic Human Heart"by
  //                            neshallads · CC BY 4.0 (project asset).
  //     Chamber isolation reuses the open-source region meshes
  //     (LV.stl · RV.stl · MYO.stl · full_heart.obj · region_map.json)
  //     via ChamberHeart / DeformableHeart — never a placeholder.
  //   GLB missing/regressed        → procedural fallback (never blank)
  const legacyURL = customURL || '/models/heart.glb'

  // Clear blob-URL entries from the GLTF cache (real leak prevention)
  useEffect(
    () => () => {
      if (customURL && customURL.startsWith('blob:')) {
        try {
          useGLTF.clear(customURL)
        } catch (err) {
          console.warn('GLTF cache clear failed', err)
        }
      }
    },
    [customURL]
  )

  const legacyPipeline = (
    <GLTFBoundary fallback={<ProceduralHeart opacity={tissueOpacity} />}>
      <Suspense fallback={<ProceduralHeart opacity={tissueOpacity} />}>
        <ModelLoader
          key={legacyURL}
          url={legacyURL}
          baseScale={baseScale}
          onBeat={onBeat}
          groupRef={heartGroupRef}
          tissueOpacity={tissueOpacity}
          showEduTags={showEduTags}
          onSelectPart={onSelectPart}
        />
      </Suspense>
    </GLTFBoundary>
  )

  return <group ref={heartGroupRef}>{legacyPipeline}</group>
}

useGLTF.preload('/models/heart.glb')
