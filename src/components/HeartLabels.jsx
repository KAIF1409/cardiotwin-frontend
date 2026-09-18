/**
 * HeartLabels.jsx — on-demand anatomical labels with anatomy isolation
 * ────────────────────────────────────────────────────────────────────
 * Labels appear ONLY when user clicks the "Labels"toggle
 * Each label is clickable → opens anatomy isolation panel
 * "Anatomy"mode replaces the heart with the selected structure's 3D model
 * Click "Return to Heart"to go back to the full heart model
 */

import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// ─── LABEL ANCHORS — positioned at structure centers ─────────────────────────
const LABEL_ANCHORS = [
  {
    id: 'LV',
    fullName: 'Left Ventricle',
    color: '#00bcd4',
    pos: new THREE.Vector3(-0.35, -0.2, 0.15),
    normal: new THREE.Vector3(-1, -0.5, 1).normalize()
  },
  {
    id: 'RV',
    fullName: 'Right Ventricle',
    color: '#ff9800',
    pos: new THREE.Vector3(0.3, -0.15, 0.2),
    normal: new THREE.Vector3(1, -0.5, 1).normalize()
  },
  {
    id: 'LA',
    fullName: 'Left Atrium',
    color: '#ab47bc',
    pos: new THREE.Vector3(-0.28, 0.25, -0.2),
    normal: new THREE.Vector3(-1, 0.5, -1).normalize()
  },
  {
    id: 'RA',
    fullName: 'Right Atrium',
    color: '#ef5350',
    pos: new THREE.Vector3(0.28, 0.25, -0.15),
    normal: new THREE.Vector3(1, 0.5, -1).normalize()
  },
  {
    id: 'Aorta',
    fullName: 'Aorta',
    color: '#00e676',
    pos: new THREE.Vector3(-0.12, 0.65, 0.05),
    normal: new THREE.Vector3(-0.3, 1, 0.3).normalize()
  },
  {
    id: 'PA',
    fullName: 'Pulmonary Artery',
    color: '#ffd740',
    pos: new THREE.Vector3(0.15, 0.6, 0.1),
    normal: new THREE.Vector3(0.3, 1, 0.3).normalize()
  },
  {
    id: 'MV',
    fullName: 'Mitral Valve',
    color: '#80cbc4',
    pos: new THREE.Vector3(-0.2, 0.05, 0.1),
    normal: new THREE.Vector3(-0.5, 0, 1).normalize()
  },
  {
    id: 'TV',
    fullName: 'Tricuspid Valve',
    color: '#f48fb1',
    pos: new THREE.Vector3(0.2, 0.05, 0.1),
    normal: new THREE.Vector3(0.5, 0, 1).normalize()
  },
  {
    id: 'AV',
    fullName: 'Aortic Valve',
    color: '#ce93d8',
    pos: new THREE.Vector3(-0.05, 0.35, 0.08),
    normal: new THREE.Vector3(-0.2, 1, 0.3).normalize()
  },
  {
    id: 'PV',
    fullName: 'Pulmonary Valve',
    color: '#fff176',
    pos: new THREE.Vector3(0.1, 0.4, 0.08),
    normal: new THREE.Vector3(0.3, 1, 0.3).normalize()
  },
  {
    id: 'MYO',
    fullName: 'Myocardium',
    color: '#ff6e6e',
    pos: new THREE.Vector3(0.0, -0.62, 0.1),
    normal: new THREE.Vector3(0, -1, 0.3).normalize()
  },
  {
    id: 'Apex',
    fullName: 'Cardiac Apex',
    color: '#f06292',
    pos: new THREE.Vector3(0.0, -0.8, 0.05),
    normal: new THREE.Vector3(0, -1, 0).normalize()
  },
  {
    id: 'IVS',
    fullName: 'Interventricular Septum',
    color: '#80cbc4',
    pos: new THREE.Vector3(0.02, -0.1, 0.18),
    normal: new THREE.Vector3(0, 0, 1).normalize()
  },
  {
    id: 'SVC',
    fullName: 'Superior Vena Cava',
    color: '#90caf9',
    pos: new THREE.Vector3(0.2, 0.7, -0.05),
    normal: new THREE.Vector3(0.5, 1, -0.2).normalize()
  },
  {
    id: 'IVC',
    fullName: 'Inferior Vena Cava',
    color: '#64b5f6',
    pos: new THREE.Vector3(0.15, -0.55, -0.05),
    normal: new THREE.Vector3(0.3, -1, -0.2).normalize()
  },
  {
    id: 'PVein',
    fullName: 'Pulmonary Veins',
    color: '#aed581',
    pos: new THREE.Vector3(-0.2, 0.3, -0.25),
    normal: new THREE.Vector3(-0.5, 0.5, -1).normalize()
  }
]

// ── Reusable vectors (avoid GC pressure) ─────────────────────────────────────
const _worldPos = new THREE.Vector3()
const _worldNormal = new THREE.Vector3()
const _toCam = new THREE.Vector3()
const _normalMat = new THREE.Matrix3()

// ─── 3D PROJECTOR ─────────────────────────────────────────────────────────────
// `enabled`(default FALSE) — spec: labels are hidden until the user flips the
// Labels toggle. While disabled the projector early-outs, costing nothing.
export function HeartLabels3D({ onProjected, heartGroupRef, enabled = false }) {
  const { camera, size } = useThree()

  useFrame(() => {
    if (!enabled) return
    const heart = heartGroupRef?.current
    if (!heart) return

    // Normal matrix = inverse-transpose of the upper 3×3 of world matrix
    // This correctly transforms normals when the object is scaled/rotated.
    _normalMat.getNormalMatrix(heart.matrixWorld)

    const projected = LABEL_ANCHORS.map(label => {
      // ── 1. Transform anchor position to world space ───────────────
      _worldPos.copy(label.pos).applyMatrix4(heart.matrixWorld)

      // ── 2. Transform normal to world space ────────────────────────
      _worldNormal.copy(label.normal).applyMatrix3(_normalMat).normalize()

      // ── 3. Direction from anchor → camera ────────────────────────
      _toCam.subVectors(camera.position, _worldPos).normalize()

      // ── 4. Back-face culling: dot > 0 means facing camera ─────────
      // Threshold 0.0 = exactly 90°; use small positive margin so
      // labels disappear slightly before they hit the silhouette.
      const facingCamera = _worldNormal.dot(_toCam) > 0.08

      // ── 5. NDC → pixel coords ─────────────────────────────────────
      const ndc = _worldPos.clone().project(camera)
      const x = (ndc.x * 0.5 + 0.5) * size.width
      const y = (-ndc.y * 0.5 + 0.5) * size.height

      // behind camera guard
      const inFront = ndc.z < 1.0

      return {
        id: label.id,
        x,
        y,
        visible: facingCamera && inFront
      }
    })

    onProjected(projected)
  })

  return null
}

// ─── HTML OVERLAY — MINIMAL ──────────────────────────────────────────────────
// NO hover tooltips. NO panels. NO introduction text. NO EF badges.
// Just tiny dots + tiny text. That's it.
export function HeartLabelsHTML({ labels, onFocus }) {
  if (!labels || labels.length === 0) return null

  const map = {}
  labels.forEach(l => {
    map[l.id] = l
  })

  return (
    <div
      className="labels-layer"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 5
      }}
    >
      {LABEL_ANCHORS.map(label => {
        const p = map[label.id]
        if (!p?.visible) return null

        return (
          <div
            key={label.id}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
            onClick={() => onFocus?.(label.id)}
            title={label.fullName}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: label.color,
                border: '1.5px solid rgba(255,255,255,0.6)',
                boxShadow: `0 0 4px ${label.color}88`,
                flexShrink: 0
              }}
            />
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: label.color,
                background: 'rgba(6,6,18,0.75)',
                padding: '1px 4px',
                borderRadius: 3,
                whiteSpace: 'nowrap',
                letterSpacing: '0.3px',
                lineHeight: 1.2
              }}
            >
              {label.id}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Legacy default export (no-op)
export default function HeartLabels() {
  return null
}

// Public list for the viewport toolbar / camera focus system
export const ANATOMY_MARKERS = LABEL_ANCHORS
