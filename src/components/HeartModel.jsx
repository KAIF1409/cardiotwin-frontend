import {
  useRef,
  useEffect,
  Suspense,
  useMemo,
} from 'react'

import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'

import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────
// HEART MESH
// ─────────────────────────────────────────────────────────────
function HeartMesh({
  scene,
  baseScale,
  heartRate,
  onBeat,
  groupRef,
}) {
  const modelRef = useRef()

  const timeRef = useRef(0)
  const lastBeatRef = useRef(false)

  // Clone scene safely
  const clonedScene = useMemo(() => {
    return scene.clone(true)
  }, [scene])

  useEffect(() => {
    if (!clonedScene) return

    // ==================================================
    // RESET TRANSFORMS
    // ==================================================
    clonedScene.position.set(0, 0, 0)
    clonedScene.rotation.set(0, 0, 0)
    clonedScene.scale.set(1, 1, 1)

    // ==================================================
    // COMPUTE MODEL BOUNDS
    // ==================================================
    const box = new THREE.Box3().setFromObject(
      clonedScene
    )

    const size = new THREE.Vector3()
    const center = new THREE.Vector3()

    box.getSize(size)
    box.getCenter(center)

    const maxAxis = Math.max(
      size.x,
      size.y,
      size.z
    )

    // Prevent broken models
    if (!maxAxis || maxAxis <= 0) {
      console.warn('Invalid GLB model size')
      return
    }

    // ==================================================
    // AUTO SCALE
    // ==================================================
    const normalizedScale = 2 / maxAxis

    clonedScene.scale.setScalar(normalizedScale)

    // ==================================================
    // RECENTER AFTER SCALING
    // ==================================================
    clonedScene.position.set(
      -center.x * normalizedScale,
      -center.y * normalizedScale,
      -center.z * normalizedScale
    )

    // ==================================================
    // FIX MATERIALS
    // ==================================================
    clonedScene.traverse((child) => {
      if (!child.isMesh) return

      child.castShadow = true
      child.receiveShadow = true

      // Clone material once
      if (!child.userData.fixedMaterial) {
        child.material = child.material.clone()

        child.material.color = new THREE.Color(
          '#c0392b'
        )

        child.material.roughness = 0.4
        child.material.metalness = 0.1

        child.userData.fixedMaterial = true
      }

      // Fix normals
      if (child.geometry) {
        child.geometry.computeVertexNormals()
      }
    })

    console.log('MODEL SIZE:', size)
    console.log(
      'NORMALIZED SCALE:',
      normalizedScale
    )

    // ==================================================
    // CLEANUP
    // ==================================================
    return () => {
      clonedScene.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose()

          if (Array.isArray(child.material)) {
            child.material.forEach((m) =>
              m.dispose()
            )
          } else {
            child.material?.dispose()
          }
        }
      })
    }
  }, [clonedScene])

  // ==================================================
  // HEARTBEAT ANIMATION
  // ==================================================
  useFrame((_, delta) => {
    timeRef.current += delta

    const bps = heartRate / 60

    const beat = Math.sin(
      timeRef.current *
        bps *
        Math.PI *
        2
    )

    const isBeat = beat > 0.8

    if (
      isBeat &&
      !lastBeatRef.current
    ) {
      onBeat?.()
    }

    lastBeatRef.current = isBeat

    const pulse =
      baseScale +
      (isBeat
        ? (beat - 0.8) * 0.15
        : 0)

    // Animate OUTER GROUP ONLY
    if (groupRef?.current) {
      groupRef.current.scale.setScalar(
        pulse
      )

     
    }
  })

  return (
    <primitive
      ref={modelRef}
      object={clonedScene}
      dispose={null}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// MODEL LOADER
// ─────────────────────────────────────────────────────────────
function ModelLoader(props) {
  const { url } = props

  // IMPORTANT:
  // useGLTF caches aggressively
  // key prop outside forces refresh
  const gltf = useGLTF(url)

  console.log('LOADED MODEL:', url)

  return (
    <HeartMesh
      {...props}
      scene={gltf.scene}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────
export default function HeartModel({
  baseScale = 1,
  heartRate = 72,
  onBeat,
  customURL,
  heartGroupRef,
}) {
  const modelURL =
    customURL || '/models/heart.glb'

  // Cleanup GLTF cache for blob URLs
  useEffect(() => {
    return () => {
      if (
        customURL &&
        customURL.startsWith('blob:')
      ) {
        try {
          useGLTF.clear(customURL)
        } catch (err) {
          console.warn(
            'GLTF cache clear failed',
            err
          )
        }
      }
    }
  }, [customURL])

  return (
    <group ref={heartGroupRef}>
      <Suspense
        fallback={
          <mesh>
            <sphereGeometry
              args={[0.5, 16, 16]}
            />
            <meshStandardMaterial
              color="#444"
              wireframe
            />
          </mesh>
        }
      >
        <ModelLoader
          key={modelURL}
          url={modelURL}
          baseScale={baseScale}
          heartRate={heartRate}
          onBeat={onBeat}
          groupRef={heartGroupRef}
        />
      </Suspense>
    </group>
  )
}