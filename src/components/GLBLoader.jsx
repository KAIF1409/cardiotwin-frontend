import { useRef, useEffect, Suspense } from 'react'
import { useLoader, useFrame } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────
// Animated pulsing wrapper
// ─────────────────────────────────────────────────────────────
function PulsingMesh({
  scene,
  baseScale,
  heartRate,
  onBeat,
}) {
  const groupRef = useRef()
  const timeRef = useRef(0)
  const lastBeatRef = useRef(false)

  useFrame((_, delta) => {
    timeRef.current += delta

    const bps = heartRate / 60
    const beat = Math.sin(timeRef.current * bps * Math.PI * 2)

    const isBeat = beat > 0.85

    if (isBeat && !lastBeatRef.current) {
      onBeat?.()
    }

    lastBeatRef.current = isBeat

    const pulse =
      baseScale + (isBeat ? (beat - 0.85) * 0.4 : 0)

    if (groupRef.current) {
      groupRef.current.scale.setScalar(pulse * 2)
      groupRef.current.rotation.y += delta * 0.1
    }
  })

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  )
}

// ─────────────────────────────────────────────────────────────
// Safe GLB Loader
// ─────────────────────────────────────────────────────────────
function LoadedModel({
  url,
  baseScale = 1,
  heartRate = 72,
  onBeat,
}) {
  // IMPORTANT:
  // Remove Date.now() cache breaker
  // It causes loader instability
  const gltf = useLoader(GLTFLoader, url)

  useEffect(() => {
    if (!gltf?.scene) return

    const box = new THREE.Box3().setFromObject(gltf.scene)
    const size = new THREE.Vector3()

    box.getSize(size)

    const maxAxis = Math.max(size.x, size.y, size.z)

    // Auto normalize huge/small imported models
    if (maxAxis > 0) {
      const scale = 1.5 / maxAxis
      gltf.scene.scale.setScalar(scale)
    }

    // Center model
    const center = new THREE.Vector3()
    box.getCenter(center)

    gltf.scene.position.sub(center)

    // Apply materials safely
    gltf.scene.traverse((child) => {
      if (!child.isMesh) return

      child.castShadow = true
      child.receiveShadow = true

      // Prevent repeated material cloning
      if (!child.userData.fixedMaterial) {
        child.material = child.material.clone()

        child.material.color = new THREE.Color('#c0392b')
        child.material.roughness = 0.5
        child.material.metalness = 0.1

        child.userData.fixedMaterial = true
      }

      // Fix broken normals
      if (child.geometry) {
        child.geometry.computeVertexNormals()
      }
    })

    return () => {
      // Cleanup geometries/materials
      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose()

          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose())
          } else {
            child.material?.dispose()
          }
        }
      })
    }
  }, [gltf])

  return (
    <PulsingMesh
      scene={gltf.scene}
      baseScale={baseScale}
      heartRate={heartRate}
      onBeat={onBeat}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// Export wrapped in Suspense
// ─────────────────────────────────────────────────────────────
export default function DynamicHeartModel(props) {
  return (
    <Suspense fallback={null}>
      <LoadedModel {...props} />
    </Suspense>
  )
}

export { LoadedModel }