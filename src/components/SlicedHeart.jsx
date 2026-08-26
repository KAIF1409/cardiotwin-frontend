import { useRef, useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { onEngineFrame } from '../simulation/cardiacEngine'

// Shared clipping plane
const PLANE = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)

export default function SlicedHeart({
  baseScale,
  heartRate,
  sliceY,
  sliceAxis,
  sweeping,
  sweepSpeed,
  customURL,
}) {
  const { gl } = useThree()

  const { scene: originalScene } = useGLTF(customURL ?? '/models/heart.glb')

  // ✅ correct clone (NO hooks inside function)
  const sceneA = useMemo(() => originalScene.clone(true), [originalScene])
  const sceneB = useMemo(() => originalScene.clone(true), [originalScene])

  const groupRef = useRef()
  const sweepRef = useRef(sliceY)
  const dirRef = useRef(-1)

  // enable clipping
  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])

  // apply clipping to materials
  const applyClipping = (scene) => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone()
        child.material.clippingPlanes = [PLANE]
        child.material.clipShadows = true
        child.material.side = THREE.DoubleSide
      }
    })
  }

  useEffect(() => {
    applyClipping(sceneA)
    applyClipping(sceneB)
  }, [sceneA, sceneB])

  // axis control
  useEffect(() => {
    if (sliceAxis === 'horizontal') PLANE.normal.set(0, -1, 0)
    if (sliceAxis === 'vertical')   PLANE.normal.set(-1, 0, 0)
    if (sliceAxis === 'depth')      PLANE.normal.set(0, 0, -1)

    PLANE.constant = sliceY
    sweepRef.current = sliceY
  }, [sliceY, sliceAxis])

  // ── Master-clock pulse + MRI sweep (was a drifting private sine clock) ──
  useEffect(() => {
    const unsub = onEngineFrame((s) => {
      const k = Math.max(s.contractLV, s.contractRV)
      const pulse = baseScale * (1 - 0.15 * k)

      if (groupRef.current) {
        groupRef.current.scale.setScalar(pulse * 2)
      }

      if (sweeping && groupRef.current) {
        sweepRef.current += dirRef.current * 0.016 * (sweepSpeed || 1)
        if (sweepRef.current <= -3) dirRef.current = 1
        if (sweepRef.current >= 3) dirRef.current = -1
        PLANE.constant = sweepRef.current
      }
    })
    return unsub
  }, [baseScale, sweeping, sweepSpeed])

  const gap = 0.03

  return (
    <group ref={groupRef}>

      {/* TOP / FRONT / RIGHT HALF */}
      <primitive
        object={sceneA}
        position={
          sliceAxis === 'horizontal'
            ? [0, gap, 0]
            : sliceAxis === 'vertical'
            ? [gap, 0, 0]
            : [0, 0, gap]
        }
      />

      {/* BOTTOM / BACK / LEFT HALF */}
      <primitive
        object={sceneB}
        position={
          sliceAxis === 'horizontal'
            ? [0, -gap, 0]
            : sliceAxis === 'vertical'
            ? [-gap, 0, 0]
            : [0, 0, -gap]
        }
      />
    </group>
  )
}
