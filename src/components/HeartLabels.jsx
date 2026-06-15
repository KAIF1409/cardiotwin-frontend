import { useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// ─── LABEL ANCHORS with outward-facing normals ────────────────────────────────
// Each normal points OUTWARD from the heart surface at that anchor location.
// A label is visible only when its normal faces toward the camera.
const LABEL_ANCHORS = [
  {
    id: 'LV',
    fullName: 'Left Ventricle',
    color: '#00bcd4',
    pos:    new THREE.Vector3(-0.35, -0.20,  0.15),
    normal: new THREE.Vector3(-1,   -0.5,    1).normalize(),
    desc: 'Main pumping chamber — sends oxygenated blood to the body',
  },
  {
    id: 'RV',
    fullName: 'Right Ventricle',
    color: '#ff9800',
    pos:    new THREE.Vector3( 0.30, -0.15,  0.20),
    normal: new THREE.Vector3( 1,   -0.5,    1).normalize(),
    desc: 'Pumps deoxygenated blood to the lungs',
  },
  {
    id: 'LA',
    fullName: 'Left Atrium',
    color: '#ab47bc',
    pos:    new THREE.Vector3(-0.28,  0.25, -0.20),
    normal: new THREE.Vector3(-1,    0.5,   -1).normalize(),
    desc: 'Receives oxygenated blood from the lungs',
  },
  {
    id: 'RA',
    fullName: 'Right Atrium',
    color: '#ef5350',
    pos:    new THREE.Vector3( 0.28,  0.25, -0.15),
    normal: new THREE.Vector3( 1,    0.5,   -1).normalize(),
    desc: 'Receives deoxygenated blood from the body',
  },
  {
    id: 'Aorta',
    fullName: 'Aorta',
    color: '#00e676',
    pos:    new THREE.Vector3(-0.12,  0.65,  0.05),
    normal: new THREE.Vector3(-0.3,   1,     0.3).normalize(),
    desc: 'Main artery — carries oxygenated blood from LV to body',
  },
  {
    id: 'PA',
    fullName: 'Pulmonary Artery',
    color: '#ffd740',
    pos:    new THREE.Vector3( 0.15,  0.60,  0.10),
    normal: new THREE.Vector3( 0.3,   1,     0.3).normalize(),
    desc: 'Carries deoxygenated blood from RV to lungs',
  },
  {
    id: 'MYO',
    fullName: 'Myocardium',
    color: '#ff6e6e',
    pos:    new THREE.Vector3( 0.00, -0.62,  0.10),
    normal: new THREE.Vector3( 0,   -1,      0.3).normalize(),
    desc: 'Heart wall muscle — thickness reflects hypertrophy or damage',
  },
  // ── Extra labels that were missing ──────────────────────────────────
  {
    id: 'Apex',
    fullName: 'Cardiac Apex',
    color: '#f06292',
    pos:    new THREE.Vector3( 0.00, -0.80,  0.05),
    normal: new THREE.Vector3( 0,   -1,      0).normalize(),
    desc: 'Tip of the heart — formed by the LV, points down-left',
  },
  {
    id: 'IVS',
    fullName: 'Interventricular Septum',
    color: '#80cbc4',
    pos:    new THREE.Vector3( 0.02, -0.10,  0.18),
    normal: new THREE.Vector3( 0,    0,      1).normalize(),
    desc: 'Wall separating LV and RV — thickened in HCM',
  },
]

// ── Reusable vectors (avoid GC pressure) ─────────────────────────────────────
const _worldPos    = new THREE.Vector3()
const _worldNormal = new THREE.Vector3()
const _toCam       = new THREE.Vector3()
const _normalMat   = new THREE.Matrix3()

// ─── 3D PROJECTOR ─────────────────────────────────────────────────────────────
export function HeartLabels3D({ onProjected, heartGroupRef }) {
  const { camera, size } = useThree()

  useFrame(() => {
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
      //    Threshold 0.0 = exactly 90°; use small positive margin so
      //    labels disappear slightly before they hit the silhouette.
      const facingCamera = _worldNormal.dot(_toCam) > 0.08

      // ── 5. NDC → pixel coords ─────────────────────────────────────
      const ndc = _worldPos.clone().project(camera)
      const x = ( ndc.x * 0.5 + 0.5) * size.width
      const y = (-ndc.y * 0.5 + 0.5) * size.height

      // behind camera guard
      const inFront = ndc.z < 1.0

      return {
        id:      label.id,
        x,
        y,
        visible: facingCamera && inFront,
      }
    })

    onProjected(projected)
  })

  return null
}

// ─── HTML OVERLAY ─────────────────────────────────────────────────────────────
export function HeartLabelsHTML({
  labels,
  selectedChamber,
  onSelectChamber,
  ef,
  edv,
  esv,
  contractility,
}) {
  const [hover, setHover] = useState(null)

  if (!labels || labels.length === 0) return null

  // Build lookup map
  const map = {}
  labels.forEach(l => { map[l.id] = l })

  const efVal   = ef  ?? Math.round(40 + (contractility ?? 50) * 0.3)
  const efLabel = efVal >= 55 ? '✅ Normal' : efVal >= 40 ? '⚠️ Reduced' : '🔴 Low'
  const efBg    = efVal >= 55 ? '#1b5e20'  : efVal >= 40 ? '#e65100'   : '#b71c1c'

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>

      {/* ── EF / EDV / ESV badges ── */}
      <div style={{
        position: 'absolute', top: 10, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', gap: 8, alignItems: 'center',
        flexWrap: 'wrap', justifyContent: 'center',
        pointerEvents: 'none', zIndex: 20,
      }}>
        <div style={{
          background: efBg, color: 'white',
          padding: '4px 16px', borderRadius: 20,
          fontSize: 13, fontWeight: 'bold',
          boxShadow: '0 2px 12px #0008',
        }}>
          EF: {efVal}% {efLabel}
        </div>
        {edv && (
          <div style={{
            background: '#0d1b2a', border: '1px solid #00bcd444',
            color: '#00bcd4', padding: '4px 10px',
            borderRadius: 20, fontSize: 11, fontWeight: 'bold',
          }}>
            EDV: {edv} ml
          </div>
        )}
        {esv && (
          <div style={{
            background: '#0d1b2a', border: '1px solid #ff980044',
            color: '#ff9800', padding: '4px 10px',
            borderRadius: 20, fontSize: 11, fontWeight: 'bold',
          }}>
            ESV: {esv} ml
          </div>
        )}
      </div>

      {/* ── SVG connector lines ── */}
      <svg style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', overflow: 'visible', zIndex: 1,
      }}>
        {LABEL_ANCHORS.map(label => {
          const p = map[label.id]
          if (!p?.visible) return null
          const sel = selectedChamber === label.id
          return (
            <line key={label.id}
              x1={p.x} y1={p.y}
              x2={p.x + 16} y2={p.y}
              stroke={label.color}
              strokeWidth={sel ? 1.5 : 0.8}
              strokeDasharray={sel ? 'none' : '4 3'}
              opacity={sel ? 0.9 : 0.45}
            />
          )
        })}
      </svg>

      {/* ── Label dots + chips ── */}
      {LABEL_ANCHORS.map(label => {
        const p = map[label.id]
        if (!p?.visible) return null

        const isSelected = selectedChamber === label.id
        const isHovered  = hover === label.id

        return (
          <div
            key={label.id}
            style={{
              position: 'absolute',
              left: p.x, top: p.y,
              transform: 'translate(-50%,-50%)',
              pointerEvents: 'auto',
              cursor: 'pointer',
              zIndex: 20,
            }}
            onClick={() => onSelectChamber?.(isSelected ? null : label.id)}
            onMouseEnter={() => setHover(label.id)}
            onMouseLeave={() => setHover(null)}
          >
            {/* Pulse ring on selected */}
            {isSelected && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 24, height: 24, borderRadius: '50%',
                border: `2px solid ${label.color}`,
                transform: 'translate(-50%,-50%)',
                animation: 'ct-pulse 1.2s ease-out infinite',
                pointerEvents: 'none',
              }} />
            )}

            {/* Dot */}
            <div style={{
              width:  isSelected ? 13 : isHovered ? 11 : 8,
              height: isSelected ? 13 : isHovered ? 11 : 8,
              borderRadius: '50%',
              background: label.color,
              border: `2px solid ${isSelected ? 'white' : 'rgba(255,255,255,0.5)'}`,
              boxShadow: `0 0 ${isSelected ? 16 : isHovered ? 10 : 6}px ${label.color}`,
              transition: 'all 0.2s',
              position: 'relative', zIndex: 2,
            }} />

            {/* Chip label */}
            <div style={{
              position: 'absolute', top: '50%', left: 14,
              transform: 'translateY(-50%)',
              background: isSelected ? label.color : 'rgba(6,6,18,0.92)',
              color: isSelected ? 'white' : label.color,
              fontSize: 11, fontWeight: 'bold',
              padding: '2px 8px', borderRadius: 4,
              border: `1px solid ${label.color}`,
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
              boxShadow: isSelected ? `0 0 10px ${label.color}55` : '0 1px 4px #000a',
              letterSpacing: '0.5px', zIndex: 3,
            }}>
              {label.id}
            </div>

            {/* Hover tooltip */}
            {isHovered && (
              <div style={{
                position: 'absolute', bottom: 22, left: '50%',
                transform: 'translateX(-50%)',
                background: '#080818',
                border: `1px solid ${label.color}`,
                color: 'white', fontSize: 10,
                padding: '7px 12px', borderRadius: 8,
                zIndex: 200,
                boxShadow: `0 4px 20px #000c, 0 0 10px ${label.color}33`,
                pointerEvents: 'none',
                width: 200, whiteSpace: 'normal',
                lineHeight: 1.6, textAlign: 'center',
              }}>
                <div style={{ color: label.color, fontWeight: 'bold', marginBottom: 4, fontSize: 11 }}>
                  {label.fullName}
                </div>
                <div style={{ color: '#bbb' }}>{label.desc}</div>
                {/* Arrow */}
                <div style={{
                  position: 'absolute', bottom: -6, left: '50%',
                  transform: 'translateX(-50%)',
                  width: 0, height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: `6px solid ${label.color}`,
                }} />
              </div>
            )}
          </div>
        )
      })}

      {/* ── Bottom hint ── */}
      <div style={{
        position: 'absolute', bottom: 12, left: '50%',
        transform: 'translateX(-50%)',
        color: '#3a3a5a', fontSize: 11,
        pointerEvents: 'none', whiteSpace: 'nowrap',
        letterSpacing: '0.3px',
      }}>
        Click labels to explore · Drag to rotate · Scroll to zoom
      </div>

      {/* ── Pulse animation ── */}
      <style>{`
        @keyframes ct-pulse {
          0%   { transform: translate(-50%,-50%) scale(0.6); opacity: 0.9; }
          100% { transform: translate(-50%,-50%) scale(2.4); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// Legacy default export (no-op)
export default function HeartLabels() { return null }