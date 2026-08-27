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

import { useRef, useEffect, useMemo, Suspense } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { onEngineFrame } from '../simulation/cardiacEngine'

// Tissue palette
const TISSUE = {
  base:       new THREE.Color('#9e2b25'),
  sssTint:    new THREE.Color('#ff6a5e'),
  deep:       new THREE.Color('#5c120f'),
}

/** Apply clinical-glass PBR material to every mesh in a scene. */
export function applyTissueMaterial(scene, { opacity = 1, color } = {}) {
  scene.traverse(child => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true

    const mat = new THREE.MeshPhysicalMaterial({
      color: color ?? TISSUE.base,
      roughness: 0.30,          // spec §1.2
      metalness: 0.02,
      transmission: 0.10,       // spec §1.2 — living tissue translucency
      thickness: 1.6,
      ior: 1.38,
      clearcoat: 0.50,          // spec §1.2
      clearcoatRoughness: 0.35,
      sheen: 0.6,
      sheenColor: new THREE.Color('#ff8a7a'),
      emissive: TISSUE.deep,
      emissiveIntensity: 0.22,
      transparent: opacity < 1,
      opacity,
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

function HeartMesh({ scene, baseScale, groupRef }) {
  const modelRef = useRef()
  const innerRef = useRef()   // contraction target — so sibling vasculature
                              // rendered in the same outer group NEVER squeezes

  // Clone scene safely once
  const clonedScene = useMemo(() => {
    const c = scene.clone(true)
    c.position.set(0, 0, 0)
    c.rotation.set(0, 0, 0)

    const box = new THREE.Box3().setFromObject(c)
    const size = new THREE.Vector3(); box.getSize(size)
    const center = new THREE.Vector3(); box.getCenter(center)
    const maxAxis = Math.max(size.x, size.y, size.z)
    if (!maxAxis || maxAxis <= 0) return c

    const s = 2 / maxAxis
    c.scale.setScalar(s)
    c.position.set(-center.x * s, -center.y * s, -center.z * s)

    applyTissueMaterial(c)
    console.log('🫀 HeartModel normalised — scale', s.toFixed(3))
    return c
  }, [scene])

  // Dispose ONLY what we created (materials) — never cached geometry.
  useEffect(() => () => {
    clonedScene.traverse(child => {
      if (child.isMesh && child.material?.isMeshPhysicalMaterial) {
        child.material.dispose()
      }
    })
  }, [clonedScene])

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

  return (
    <group ref={innerRef}>
      <primitive ref={modelRef} object={clonedScene} dispose={null} />
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

function WireframeFallback() {
  return (
    <mesh>
      <sphereGeometry args={[0.9, 24, 24]} />
      <meshStandardMaterial color="#12303a" wireframe />
    </mesh>
  )
}

export default function HeartModel({
  baseScale = 1,
  heartRate = 72,          // kept for API compat — engine owns timing now
  onBeat,
  customURL,
  heartGroupRef,
}) {
  const modelURL = customURL || '/models/heart.glb'

  // Clear blob-URL entries from the GLTF cache (real leak prevention)
  useEffect(() => () => {
    if (customURL && customURL.startsWith('blob:')) {
      try { useGLTF.clear(customURL) } catch (err) { console.warn('GLTF cache clear failed', err) }
    }
  }, [customURL])

  return (
    <group ref={heartGroupRef}>
      <Suspense fallback={<WireframeFallback />}>
        <ModelLoader
          key={modelURL}
          url={modelURL}
          baseScale={baseScale}
          onBeat={onBeat}
          groupRef={heartGroupRef}
        />
      </Suspense>
    </group>
  )
}

useGLTF.preload('/models/heart.glb')
