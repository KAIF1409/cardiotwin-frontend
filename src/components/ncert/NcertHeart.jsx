/**
 * NcertHeart.jsx — NCERT procedural heart (Blender → ncert_heart.glb)
 * ═══════════════════════════════════════════════════════════════════════
 * Loads public/models/ncert_heart.glb produced by generate_ncert_heart.py.
 * NODE NAMES ARE CONTRACTUAL — any mismatch throws and HeartModel.jsx falls
 * back to the legacy patient-mesh pipeline:
 *
 *   chambers  : Left_Ventricle · Right_Ventricle · Left_Atrium · Right_Atrium
 *   vessels   : Aorta · Superior_Vena_Cava · Inferior_Vena_Cava ·
 *               Pulmonary_Artery · Pulmonary_Veins
 *   valves    : Tricuspid_Valve · Bicuspid_Mitral_Valve ·
 *               Aortic_Semilunar_Valve · Pulmonary_Semilunar_Valve
 *   structure : Interventricular_Septum
 *   guides    : Path_Oxygenated_Flow / Path_Deoxygenated_Flow (empties with
 *               extras.routes_json — cardiotwin.bezier.v1, Y-up metres)
 *
 * Both ventricles carry the morph target "Systole"; its weight is driven
 * every frame by useContractionDriver() (useHeartbeat.js) and written to
 * mesh.morphTargetInfluences[0] — the SAME clock as ECGGraph.jsx.
 */

import { Component, useEffect, useMemo, useRef, useState } from 'react'
import { useGLTF, Html } from '@react-three/drei'
import * as THREE from 'three'
import { onEngineFrame } from '../../simulation/cardiacEngine'
import { useContractionDriver } from '../../hooks/useHeartbeat'
import NcertFlowParticles from './NcertFlowParticles'

export const NCERT_HEART_URL = '/models/ncert_heart.glb'

/** Nodes that must exist for the NCERT pipeline to accept the asset. */
export const NCERT_REQUIRED_NODES = [
  'Left_Ventricle',
  'Right_Ventricle',
  'Left_Atrium',
  'Right_Atrium',
  'Aorta',
  'Superior_Vena_Cava',
  'Inferior_Vena_Cava',
  'Pulmonary_Artery',
  'Pulmonary_Veins',
  'Tricuspid_Valve',
  'Bicuspid_Mitral_Valve',
  'Aortic_Semilunar_Valve',
  'Pulmonary_Semilunar_Valve',
  'Interventricular_Septum',
  'Path_Oxygenated_Flow',
  'Path_Deoxygenated_Flow'
]

/** Persistent clickable educational tags (NCERT-aligned, Class 10/11). */
const NCERT_TAGS = [
  {
    node: 'Aorta',
    label: 'Aorta',
    blurb: 'Largest artery — distributes oxygenated blood from the LV to the whole body.',
    ncert: 'Class 10 · Ch 6 Life Processes'
  },
  {
    node: 'Left_Ventricle',
    label: 'Left Ventricle',
    blurb: 'Thick-walled chamber that pumps oxygenated blood into systemic circulation.',
    ncert: 'Class 10 · Ch 6'
  },
  {
    node: 'Right_Ventricle',
    label: 'Right Ventricle',
    blurb: 'Pumps deoxygenated blood through the pulmonary artery to the lungs.',
    ncert: 'Class 10 · Ch 6'
  },
  {
    node: 'Right_Atrium',
    label: 'SA Node — the pacemaker',
    saNode: true,
    blurb: 'The SA node sits in the right atrial wall and sets the heartbeat rhythm (~72 bpm).',
    ncert: 'Class 11 · Ch 18 Body Fluids & Circulation'
  },
  {
    node: 'Bicuspid_Mitral_Valve',
    label: 'Bicuspid (Mitral) Valve',
    blurb: 'Two flaps guarding the LA → LV opening; prevents backflow during systole.',
    ncert: 'Class 11 · Ch 18'
  },
  {
    node: 'Aortic_Semilunar_Valve',
    label: 'Aortic Semilunar Valve',
    blurb: 'Three pocket valves at the LV outlet — closes with the “dub” of the heartbeat.',
    ncert: 'Class 11 · Ch 18'
  }
]

/** PBR upgrade that PRESERVES the educational red/blue/septum palette. */
function upgradeMaterial(src) {
  const colour = (src?.color ?? new THREE.Color('#9e2b25')).clone()
  const mat = new THREE.MeshPhysicalMaterial({
    color: colour,
    roughness: 0.38,
    metalness: 0.02,
    clearcoat: 0.45,
    clearcoatRoughness: 0.35,
    sheen: 0.5,
    sheenColor: colour.clone().lerp(new THREE.Color('#ffffff'), 0.35),
    emissive: colour.clone().multiplyScalar(0.1),
    emissiveIntensity: 0.35,
    side: THREE.DoubleSide // hollow cavity walls stay visible
  })
  if (src) {
    if (src.map) mat.map = src.map
    if (src.normalMap) mat.normalMap = src.normalMap
  }
  return mat
}

/** Bounding-box centre of a node in its own local (GLB) space. */
function nodeCentre(node, target = new THREE.Vector3()) {
  node.updateWorldMatrix(true, false)
  return new THREE.Box3().setFromObject(node).getCenter(target)
}

// ─────────────────────────────────────────────────────────────────────────────
// NCERT MESH — mounts INSIDE the Canvas. Throws on any missing contractual
// node so the caller's error boundary swaps to the legacy pipeline.
// ─────────────────────────────────────────────────────────────────────────────
function NcertMesh({
  showTags = true,
  showFlow = true,
  isolate = null,
  onSelectPart,
  dimOpacity = 0.05
}) {
  const { scene, nodes } = useGLTF(NCERT_HEART_URL)

  // ── Contract validation (fail loudly → legacy fallback) ──────────────────
  const missing = NCERT_REQUIRED_NODES.filter(n => !nodes[n])
  if (missing.length > 0) {
    throw new Error(`ncert_heart.glb missing contractual nodes: ${missing.join(', ')}`)
  }

  const contraction = useContractionDriver()

  // ── One-time scene preparation (clone, materials, layout, tags) ──────────
  const built = useMemo(() => {
    const clone = scene.clone(true)
    clone.updateMatrixWorld(true)

    // Normalise to the app's ~2-unit heart convention (same as HeartModel).
    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const cent = box.getCenter(new THREE.Vector3())
    const scale = 2 / Math.max(size.x, size.y, size.z, 1e-6)

    // PBR upgrade preserving the oxygenation palette.
    clone.traverse(child => {
      if (!child.isMesh) return
      const upgraded = upgradeMaterial(child.material)
      child.material = upgraded
      child.castShadow = true
      child.receiveShadow = true
    })

    // Ventricles → morph targets ("Systole"→ influences[0]).
    const ventricles = {
      lv: clone.getObjectByName('Left_Ventricle') ?? null,
      rv: clone.getObjectByName('Right_Ventricle') ?? null
    }
    for (const v of Object.values(ventricles)) {
      if (v && !v.morphTargetInfluences) {
        throw new Error(
          `NCERT ventricle "${v.name}"has no morph targets — regenerate the GLB with shape keys`
        )
      }
    }

    // Bezier flow guides exported as empty nodes with routes_json extras.
    const readRoutes = nodeName => {
      try {
        const json = nodes[nodeName]?.userData?.routes_json
        if (!json) return null
        const routes = JSON.parse(json)
        return Array.isArray(routes) && routes.length > 0 ? routes : null
      } catch {
        return null
      }
    }

    // Tag anchors: node bbox centres in GLB metre space (tags live inside
    // the same scaled group, so no coordinate conversion is needed).
    const tags = NCERT_TAGS.map(tag => {
      const node = nodes[tag.node]
      if (!node) return null
      const anchor = nodeCentre(node)
      if (tag.saNode) {
        // Lift the SA-node tag onto the superior RA wall.
        const bb = new THREE.Box3().setFromObject(node)
        anchor.y += bb.getSize(new THREE.Vector3()).y * 0.3
      }
      return { ...tag, anchor: [anchor.x, anchor.y, anchor.z] }
    }).filter(Boolean)

    return {
      clone,
      scale,
      offset: cent.clone().multiplyScalar(-scale),
      ventricles,
      tags,
      routesO2: readRoutes('Path_Oxygenated_Flow'),
      routesDE: readRoutes('Path_Deoxygenated_Flow')
    }
  }, [scene, nodes])

  const innerRef = useRef(null)

  // ── Morph driver: packet/engine contraction → morphTargetInfluences[0] ───
  useEffect(
    () =>
      onEngineFrame(() => {
        const { lv, rv } = contraction.current
        const lvMesh = built.ventricles.lv
        const rvMesh = built.ventricles.rv
        if (lvMesh?.morphTargetInfluences?.length > 0) {
          lvMesh.morphTargetInfluences[0] = lv
        }
        if (rvMesh?.morphTargetInfluences?.length > 0) {
          rvMesh.morphTargetInfluences[0] = rv
        }
        if (innerRef.current) {
          innerRef.current.rotation.z = -0.03 * lv // subtle apical twist
        }
      }),
    [contraction, built]
  )

  // ── Chamber isolation mode (dim everything but the selected part) ────────
  useEffect(() => {
    const dim = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: dimOpacity,
      depthWrite: false
    })
    built.clone.traverse(child => {
      if (!child.isMesh) return
      if (child.name.startsWith('Path_')) {
        child.visible = !isolate
        return
      }
      if (!child.userData.ncertMat) child.userData.ncertMat = child.material
      child.material = isolate && child.name !== isolate ? dim : child.userData.ncertMat
    })
  }, [isolate, built, dimOpacity])

  const [activeTag, setActiveTag] = useState(null)
  const handleTagClick = tag => {
    setActiveTag(cur => (cur === tag.node ? null : tag.node))
    onSelectPart?.(tag)
  }

  return (
    <group>
      <group scale={built.scale} position={built.offset}>
        <group ref={innerRef}>
          <primitive object={built.clone} dispose={null} />
        </group>

        {/* Persistent clickable NCERT tags (Drei <Html> screen-space anchors) */}
        {showTags &&
          built.tags.map(tag => (
            <Html
              key={tag.node}
              position={tag.anchor}
              center
              distanceFactor={6}
              zIndexRange={[40, 20]}
            >
              <div
                className={`ct-tag ${activeTag === tag.node ? 'open' : ''}`}
                data-part={tag.node}
                onClick={() => handleTagClick(tag)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTagClick(tag)
                }}
              >
                <span className="ct-tag-dot" />
                <span className="ct-tag-label">{tag.label}</span>
                {activeTag === tag.node && (
                  <span className="ct-tag-card">
                    <b>{tag.label}</b>
                    <i>{tag.ncert}</i>
                    <em>{tag.blurb}</em>
                  </span>
                )}
              </div>
            </Html>
          ))}

        {/* Blood-flow particle systems riding the exported Bezier guides */}
        {showFlow && (built.routesO2 || built.routesDE) && (
          <NcertFlowParticles routesO2={built.routesO2} routesDE={built.routesDE} />
        )}
      </group>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WRAPPER — boundary + suspense so a missing/regressed GLB silently restores
// the legacy heart pipeline (HeartModel.jsx decides the fallback content).
// ─────────────────────────────────────────────────────────────────────────────
class NcertBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error) {
    console.warn(
      '[NCERT] ncert_heart.glb unavailable — legacy heart pipeline active:',
      error?.message
    )
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export default function NcertHeart(props) {
  return (
    <NcertBoundary fallback={props.fallback ?? null}>
      <NcertMesh {...props} />
    </NcertBoundary>
  )
}

useGLTF.preload(NCERT_HEART_URL)
