import React, {
  useRef,
  useEffect,
  useState,
  Suspense,
  Component,
} from 'react'

import { useFrame, useLoader } from '@react-three/fiber'
import { Html } from '@react-three/drei'

import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'

import * as THREE from 'three'

// ─────────────────────────────────────────────
// CHAMBER CONFIG
// ─────────────────────────────────────────────

const CHAMBERS = [
  // LEFT VENTRICLE
  {
    id: 'LV',

    label: 'Left Ventricle',

    info: 'Pumps oxygenated blood to body',

    stl: '/models/LV.stl',

    modelScale: 0.028,

    position: [-0.12, -0.08, 0],

    rotation: [0, 0, 0],

    color: '#E84040',

    hoverColor: '#ff6b6b',

    emissiveColor: '#ff0000',

    baseStrain: -20.5,

    infarctSensitivity: 0.18,

    useSphere: false,
  },

  // RIGHT VENTRICLE
  {
    id: 'RV',

    label: 'Right Ventricle',

    info: 'Pumps deoxygenated blood to lungs',

    stl: '/models/RV.stl',

    modelScale: 0.028,

    position: [0.16, -0.12, 0.05],

    rotation: [0, 0, 0],

    color: '#4488FF',

    hoverColor: '#82b1ff',

    emissiveColor: '#1565c0',

    baseStrain: -26.0,

    infarctSensitivity: 0.09,

    useSphere: false,
  },

  // MYOCARDIUM
  {
    id: 'MYO',

    label: 'Myocardium',

    info: 'Heart wall muscle',

    stl: '/models/MYO.stl',

    modelScale: 0.028,

    position: [0, -0.02, -0.08],

    rotation: [0, 0, 0],

    color: '#FF8C00',

    hoverColor: '#ffb74d',

    emissiveColor: '#e65100',

    baseStrain: -18.5,

    infarctSensitivity: 0.22,

    useSphere: false,
  },

  // LEFT ATRIUM
  {
    id: 'LA',

    label: 'Left Atrium',

    info: 'Receives oxygenated blood',

    useSphere: true,

    sphereScale: [0.28, 0.28, 0.28],

    spherePos: [-0.18, 0.30, -0.12],

    color: '#ab47bc',

    hoverColor: '#ce93d8',

    emissiveColor: '#6a1b9a',

    baseStrain: -32.0,

    infarctSensitivity: 0.05,
  },

  // RIGHT ATRIUM
  {
    id: 'RA',

    label: 'Right Atrium',

    info: 'Receives deoxygenated blood',

    useSphere: true,

    sphereScale: [0.26, 0.26, 0.26],

    spherePos: [0.20, 0.28, -0.08],

    color: '#ef5350',

    hoverColor: '#f48fb1',

    emissiveColor: '#880e4f',

    baseStrain: -29.5,

    infarctSensitivity: 0.04,
  },
]

// ─────────────────────────────────────────────
// STRAIN HELPERS
// ─────────────────────────────────────────────

function getChamberStrain(
  chamber,
  infarct
) {
  const raw =
    chamber.baseStrain +
    infarct *
      chamber.infarctSensitivity

  return parseFloat(
    Math.min(-0.5, raw).toFixed(1)
  )
}

function getStrainColor(
  strain,
  fallback
) {
  const abs = Math.abs(strain)

  if (abs >= 18) return fallback

  if (abs >= 12)
    return '#ff9800'

  return '#ef5350'
}

// ─────────────────────────────────────────────
// TOOLTIP
// ─────────────────────────────────────────────

function ChamberTooltip({
  chamber,
  strain,
  yOffset,
}) {
  const col = getStrainColor(
    strain,
    chamber.hoverColor
  )

  return (
    <Html
      distanceFactor={6}
      position={[0, yOffset, 0]}
    >
      <div
        style={{
          background:
            'rgba(6,6,16,0.93)',

          color: col,

          padding: '6px 12px',

          borderRadius: '8px',

          border: `1px solid ${col}`,

          fontSize: '11px',

          fontWeight: 'bold',

          whiteSpace: 'nowrap',

          pointerEvents: 'none',
        }}
      >
        {chamber.id} — {chamber.label}

        <div
          style={{
            fontSize: '10px',

            color: '#aaa',

            marginTop: '3px',
          }}
        >
          Strain: {strain}%
        </div>
      </div>
    </Html>
  )
}

// ─────────────────────────────────────────────
// STL CHAMBER
// ─────────────────────────────────────────────

function STLChamber({
  chamber,
  isSelected,
  isIsolated,
  baseScale,
  beatScale,
  onSelect,
  infarct,
}) {
  // SAFE HOOK ORDER
  const geometry = useLoader(
    STLLoader,
    chamber.stl
  )

  const [hovered, setHovered] =
    useState(false)

  const processedRef = useRef(false)

  useEffect(() => {
    if (
      !geometry ||
      processedRef.current
    )
      return

    geometry.computeBoundingBox()

    const box =
      geometry.boundingBox

    const center =
      new THREE.Vector3()

    box.getCenter(center)

    geometry.translate(
      -center.x,
      -center.y,
      -center.z
    )

    geometry.computeVertexNormals()

    processedRef.current = true
  }, [geometry])

  const strain = getChamberStrain(
    chamber,
    infarct
  )

  const scale =
    chamber.modelScale *
    baseScale *
    beatScale *
    (isSelected ? 1.04 : 1)

  const visible =
    !isIsolated || isSelected

  const color =
    hovered || isSelected
      ? getStrainColor(
          strain,
          chamber.hoverColor
        )
      : chamber.color

  if (!visible) return null

  return (
    <group
      position={chamber.position}
      rotation={chamber.rotation}
    >
      <mesh
        geometry={geometry}
        scale={[-scale, scale, scale]}
        onClick={(e) => {
          e.stopPropagation()

          onSelect(chamber.id)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()

          setHovered(true)
        }}
        onPointerOut={() =>
          setHovered(false)
        }
      >
        <meshStandardMaterial
          color={color}
          transparent
          opacity={
            isSelected ? 0.95 : 0.82
          }
          roughness={0.35}
          metalness={0.2}
          side={THREE.DoubleSide}
          emissive={
            isSelected
              ? chamber.emissiveColor
              : '#000000'
          }
          emissiveIntensity={
            isSelected ? 0.28 : 0
          }
        />
      </mesh>

      {(hovered || isSelected) && (
        <ChamberTooltip
          chamber={chamber}
          strain={strain}
          yOffset={0.6}
        />
      )}
    </group>
  )
}

// ─────────────────────────────────────────────
// SPHERE CHAMBER
// ─────────────────────────────────────────────

function SphereChamber({
  chamber,
  isSelected,
  isIsolated,
  baseScale,
  beatScale,
  onSelect,
  infarct,
}) {
  const [hovered, setHovered] =
    useState(false)

  const visible =
    !isIsolated || isSelected

  if (!visible) return null

  const strain = getChamberStrain(
    chamber,
    infarct
  )

  const [sx, sy, sz] =
    chamber.sphereScale

  return (
    <group position={chamber.spherePos}>
      <mesh
        scale={[
          sx *
            baseScale *
            beatScale,

          sy *
            baseScale *
            beatScale,

          sz *
            baseScale *
            beatScale,
        ]}
        onClick={(e) => {
          e.stopPropagation()

          onSelect(chamber.id)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()

          setHovered(true)
        }}
        onPointerOut={() =>
          setHovered(false)
        }
      >
        <sphereGeometry
          args={[1, 48, 48]}
        />

        <meshStandardMaterial
          color={
            hovered || isSelected
              ? chamber.hoverColor
              : chamber.color
          }
          transparent
          opacity={0.88}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>

      {(hovered || isSelected) && (
        <ChamberTooltip
          chamber={chamber}
          strain={strain}
          yOffset={0.45}
        />
      )}
    </group>
  )
}

// ─────────────────────────────────────────────
// ERROR BOUNDARY
// ─────────────────────────────────────────────

class ChamberErrorBoundary extends Component {
  constructor(props) {
    super(props)

    this.state = {
      failed: false,
    }
  }

  static getDerivedStateFromError() {
    return {
      failed: true,
    }
  }

  componentDidCatch(error) {
    console.error(
      'CHAMBER LOAD ERROR:',
      error
    )
  }

  render() {
    if (this.state.failed) {
      return (
        <SphereChamber
          {...this.props.chamberProps}
        />
      )
    }

    return this.props.children
  }
}

// ─────────────────────────────────────────────
// SMART CHAMBER
// ─────────────────────────────────────────────

function SmartChamber(props) {
  const { chamber } = props

  if (
    chamber.useSphere ||
    !chamber.stl
  ) {
    return (
      <SphereChamber {...props} />
    )
  }

  return (
    <ChamberErrorBoundary
      chamberProps={props}
    >
      <Suspense fallback={null}>
        <STLChamber {...props} />
      </Suspense>
    </ChamberErrorBoundary>
  )
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

export default function ChamberHeart({
  baseScale = 1,

  heartRate = 72,

  onSelectChamber,

  selectedChamber,

  infarct = 0,
}) {
  const timeRef = useRef(0)

  const beatScale = useRef(1)

  useFrame((_, delta) => {
    timeRef.current += delta

    const bps = heartRate / 60

    const beat = Math.sin(
      timeRef.current *
        bps *
        Math.PI *
        2
    )

    beatScale.current =
      1 +
      (beat > 0.8
        ? (beat - 0.8) * 0.22
        : 0)
  })

  const handleSelect = (id) => {
    if (!onSelectChamber) return

    onSelectChamber(
      selectedChamber === id
        ? null
        : id
    )
  }

  return (
    <group
      position={[0, -0.15, 0]}
      rotation={[0.1, Math.PI, 0]}
    >
      {CHAMBERS.map((chamber) => (
        <SmartChamber
          key={chamber.id}
          chamber={chamber}
          isSelected={
            selectedChamber ===
            chamber.id
          }
          isIsolated={
            selectedChamber !== null
          }
          baseScale={baseScale}
          beatScale={
            beatScale.current
          }
          onSelect={handleSelect}
          infarct={infarct}
        />
      ))}
    </group>
  )
}