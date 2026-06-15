/**
 * DeformableHeart.jsx  —  FIXED (Regional Strain Deformation)
 * =============================================================
 *
 * FIXES APPLIED vs previous version
 * -----------------------------------
 * FIX 1 — Per-region strain deformation using real backend strainRegions.
 *   The previous version applied ONE uniform scale to the entire heart mesh.
 *   This version loads region_map.json (/patients/patient085/region_map.json),
 *   which maps region keys (lv, rv, myo) to separate mesh filenames.  Each
 *   region sub-mesh is independently scaled by its own strain value from
 *   /state (via subscribeHeartData).
 *
 *   Result: when MI preset is active, the infarcted LV zone barely contracts
 *   while the healthy RV and MYO still squeeze — exactly the educational
 *   moment the teacher describes.
 *
 * FIX 2 — strainRegions prop wired from App.js (heartData?.strainRegions).
 *   The component now accepts a `strainRegions` prop and uses it as the
 *   primary deformation source.  Falls back to uniform infarct-based scale
 *   when strainRegions is null (backend offline).
 *
 * FIX 3 — regionMap prop passed from App.js, loaded once, shared.
 *   App.js fetches /patients/patient085/region_map.json on mount and passes
 *   it down.  DeformableHeart no longer fetches it internally on every
 *   render.
 *
 * FIX 4 — Preserved all existing fixes:
 *   ✅ R3F hook safe (no hooks outside Canvas)
 *   ✅ Handles GLB load failures with ErrorBoundary + FallbackHeart
 *   ✅ Multi-mesh support
 *   ✅ Safe material cloning (clone once, reuse)
 *   ✅ Cleanup on unmount
 *
 * Place this file at:  src/components/DeformableHeart.jsx
 */

import { useRef, useEffect, Suspense, Component } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { subscribeHeartData } from '../services/apiService'

// ─────────────────────────────────────────────
// HEATMAP COLORS  (strain → colour)
// ─────────────────────────────────────────────

function getHeatmapColor(strainAbs, infarct, meshIndex, totalMeshes) {
  // If we have a real strain value, use it; otherwise fall back to infarct heuristic
  if (strainAbs !== null) {
    if (strainAbs >= 0.18)  return new THREE.Color('#1565c0')  // normal  — deep blue
    if (strainAbs >= 0.12)  return new THREE.Color('#00e676')  // mildly reduced — green
    if (strainAbs >= 0.08)  return new THREE.Color('#ff9800')  // moderate — orange
    if (strainAbs >= 0.04)  return new THREE.Color('#ef5350')  // severe — red
    return                         new THREE.Color('#888888')  // infarcted — grey (barely moves)
  }

  // Legacy fallback: infarct %
  const position        = meshIndex / (totalMeshes || 1)
  const regionalInfarct = infarct * (1 - position * 0.4)
  if (regionalInfarct < 10) return new THREE.Color('#1565c0')
  if (regionalInfarct < 25) return new THREE.Color('#00e676')
  if (regionalInfarct < 40) return new THREE.Color('#ff9800')
  if (regionalInfarct < 60) return new THREE.Color('#ef5350')
  return                           new THREE.Color('#888888')
}

// ─────────────────────────────────────────────
// REGION KEY → strain field in strainRegions
// ─────────────────────────────────────────────

const REGION_STRAIN_KEY = {
  lv:         'LV',
  rv:         'RV',
  myo:        'MYO',
  lv_infarct: 'LV_infarcted',
}

// ─────────────────────────────────────────────
// FALLBACK HEART (sphere)
// ─────────────────────────────────────────────

function FallbackHeart({ baseScale, heartRate }) {
  const ref     = useRef()
  const timeRef = useRef(0)

  useFrame((_, delta) => {
    if (!ref.current) return
    timeRef.current += delta
    const bps   = heartRate / 60
    const beat  = Math.sin(timeRef.current * bps * Math.PI * 2)
    const pulse = baseScale + (beat > 0.8 ? (beat - 0.8) * 0.25 : 0)
    ref.current.scale.setScalar(pulse * 1.5)
    ref.current.rotation.y += delta * 0.08
  })

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial color="#ef5350" roughness={0.4} metalness={0.1} />
    </mesh>
  )
}

// ─────────────────────────────────────────────
// ANIMATED HEART — main component
// ─────────────────────────────────────────────

/**
 * regionMap shape (from region_map.json):
 *   { lv: { mesh: "LV.stl", ... }, rv: { mesh: "RV.stl", ... }, myo: { mesh: "MYO.stl", ... } }
 *
 * strainRegions shape (from apiService processAndNotify):
 *   { LV: -0.185, RV: -0.26, MYO: -0.20, global: -0.22 }
 *   Values are fractional (not %).
 *
 * Per-region logic:
 *   - Each mesh in the GLB scene is matched to a region by checking if
 *     its name (lowercased) contains the region key (lv, rv, myo).
 *   - If strainRegions is live, the mesh is scaled by (1 + strain * contractionGain)
 *     where contractionGain converts fractional strain → visible scale change.
 *   - A mesh with strain near 0 (infarcted) barely contracts — this is the
 *     educational "still zone" during MI preset.
 *   - If strainRegions is null (offline), falls back to uniform infarct scale.
 */
function AnimatedHeart({ scene, baseScale, heartRate, infarct, strainRegions, regionMap }) {
  const groupRef         = useRef()
  const timeRef          = useRef(0)
  const originalColors   = useRef([])
  const meshListRef      = useRef([])   // [{mesh, regionKey}]
  const initializedRef   = useRef(false)
  const liveStrainRef    = useRef(null) // updated by subscribeHeartData

  // ── Subscribe to live strain from backend ──────────────────────────────
  useEffect(() => {
    const unsub = subscribeHeartData((data) => {
      if (data?.strainRegions) {
        liveStrainRef.current = data.strainRegions
      } else if (!data) {
        liveStrainRef.current = null
      }
    })
    return () => unsub?.()
  }, [])

  // ── When strainRegions prop changes, also keep liveStrainRef in sync ───
  useEffect(() => {
    if (strainRegions) liveStrainRef.current = strainRegions
  }, [strainRegions])

  // ── Build mesh list + clone materials once ─────────────────────────────
  useEffect(() => {
    if (!scene) return

    const meshes = []
    scene.traverse((child) => {
      if (child.isMesh) meshes.push(child)
    })

    // Detect region for each mesh by name matching
    const meshList = meshes.map((mesh) => {
      const nameLower = (mesh.name || '').toLowerCase()
      let regionKey   = 'global'

      if (regionMap) {
        // Match by mesh filename or mesh name
        for (const [rKey, rVal] of Object.entries(regionMap)) {
          const meshFile = (rVal?.mesh || '').replace(/\.[^/.]+$/, '').toLowerCase()
          if (nameLower.includes(rKey) || nameLower.includes(meshFile)) {
            regionKey = rKey
            break
          }
        }
      }

      return { mesh, regionKey }
    })

    meshListRef.current = meshList

    // Clone materials once so we can mutate colour per-region
    if (!initializedRef.current) {
      originalColors.current = meshList.map(({ mesh }) => {
        if (!mesh.material) return null
        mesh.material             = mesh.material.clone()
        mesh.material.roughness   = 0.4
        mesh.material.metalness   = 0.1
        return mesh.material.color ? mesh.material.color.clone() : null
      })
      initializedRef.current = true
    }

    // Apply initial heatmap colours
    applyHeatmapColors(meshList, null, infarct)

    return () => {
      // Restore original colours on cleanup
      meshList.forEach(({ mesh }, i) => {
        if (mesh.material && originalColors.current[i]) {
          mesh.material.color.copy(originalColors.current[i])
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, regionMap])

  // Re-apply colours when infarct changes (offline mode)
  useEffect(() => {
    applyHeatmapColors(meshListRef.current, liveStrainRef.current, infarct)
  }, [infarct])

  // ─────────────────────────────────────────────────────────────────────────
  // applyHeatmapColors — sets material colour for each regional mesh
  // ─────────────────────────────────────────────────────────────────────────
  function applyHeatmapColors(meshList, strain, infarctPct) {
    const total = meshList.length || 1
    meshList.forEach(({ mesh, regionKey }, i) => {
      if (!mesh.material?.color) return
      let strainAbs = null
      if (strain) {
        const strainField = REGION_STRAIN_KEY[regionKey] || 'global'
        const val         = strain[strainField] ?? strain.global ?? null
        if (val !== null) strainAbs = Math.abs(val)
      }
      mesh.material.color.copy(getHeatmapColor(strainAbs, infarctPct, i, total))
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // useFrame — per-frame heartbeat animation with per-region strain scaling
  // ─────────────────────────────────────────────────────────────────────────
  useFrame((_, delta) => {
    if (!groupRef.current) return

    timeRef.current += delta

    const bps       = heartRate / 60
    const beatPhase = Math.sin(timeRef.current * bps * Math.PI * 2)
    const isPeak    = beatPhase > 0.8

    const strain = liveStrainRef.current

    if (strain && meshListRef.current.length > 0) {
      // ── Per-region deformation ─────────────────────────────────────────
      // Each mesh contracts by its own strain amount.
      // Strain is negative (e.g. -0.185) → abs gives contraction magnitude.
      // contractionGain converts to visible scale change (tuned for 3D legibility).
      const CONTRACTION_GAIN = 0.15

      meshListRef.current.forEach(({ mesh, regionKey }) => {
        const strainField = REGION_STRAIN_KEY[regionKey] || 'global'
        const rawStrain   = strain[strainField] ?? strain.global ?? -0.20
        const absStrain   = Math.abs(rawStrain)

        // Healthy tissue: absStrain ~0.20 → full contraction
        // Infarcted:      absStrain ~0.01 → barely moves
        const contractionMagnitude = absStrain * CONTRACTION_GAIN

        const meshScale = isPeak
          ? baseScale * (1 - contractionMagnitude * (beatPhase - 0.8) * 5)
          : baseScale

        mesh.scale.setScalar(Math.max(0.5, meshScale))
      })

      // Slow group rotation
      groupRef.current.scale.setScalar(2)
      groupRef.current.rotation.y += delta * 0.08

      // Update heatmap colours live
      applyHeatmapColors(meshListRef.current, strain, infarct)

    } else {
      // ── Fallback: uniform scale driven by infarct slider ──────────────
      const strainFactor    = 1 - infarct * 0.005
      const pulseMagnitude  = isPeak ? (beatPhase - 0.8) * 0.3 * strainFactor : 0
      const uniformScale    = baseScale + pulseMagnitude
      groupRef.current.scale.setScalar(uniformScale * 2)
      groupRef.current.rotation.y += delta * 0.08
    }
  })

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  )
}

// ─────────────────────────────────────────────
// HEART MODEL LOADER
// ─────────────────────────────────────────────

function HeartModel(props) {
  const modelURL = props.customURL || '/models/heart.glb'
  const gltf     = useGLTF(modelURL)

  if (!gltf?.scene) {
    return <FallbackHeart baseScale={props.baseScale} heartRate={props.heartRate} />
  }

  return <AnimatedHeart scene={gltf.scene} {...props} />
}

// ─────────────────────────────────────────────
// ERROR BOUNDARY
// ─────────────────────────────────────────────

class GLBErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error) {
    console.error('GLB MODEL LOAD FAILED:', error)
  }

  render() {
    if (this.state.failed) {
      return (
        <FallbackHeart
          baseScale={this.props.baseScale}
          heartRate={this.props.heartRate}
        />
      )
    }
    return this.props.children
  }
}

// ─────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────

/**
 * Props:
 *   baseScale      {number}  — scale factor from Contractility slider (0.8–1.4)
 *   heartRate      {number}  — HR in bpm (drives pulse speed)
 *   infarct        {number}  — infarct % 0–100 (fallback deformation + heatmap)
 *   strainRegions  {object}  — live from heartData?.strainRegions (primary source)
 *   regionMap      {object}  — loaded from region_map.json in App.js
 *   customURL      {string}  — optional patient GLB URL
 */
export default function DeformableHeart(props) {
  return (
    <GLBErrorBoundary baseScale={props.baseScale} heartRate={props.heartRate}>
      <Suspense
        fallback={
          <FallbackHeart
            baseScale={props.baseScale}
            heartRate={props.heartRate}
          />
        }
      >
        <HeartModel {...props} />
      </Suspense>
    </GLBErrorBoundary>
  )
}

// Preload default model
useGLTF.preload('/models/heart.glb')