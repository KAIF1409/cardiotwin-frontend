/**
 * App.js — CardioTwin-X Cardiac Education Platform
 * ══════════════════════════════════════════════════════════════════
 * ARCHITECTURE
 * ┌ HeaderBar ── live WS badge · BPM meter · BP/EF chips · Normal/Higher switch
 * ├ ControlDock (left) ── patient · hemodynamic sliders · presets · lessons
 * ├ Stage (center) ── 3D viewport + floating glass toolbar + labels
 * ├ Telemetry (right) ── ECG · PV loop · strain cards
 * └ Overlays ── Higher-mode lesson hub, popups, toasts
 *
 * ALL animation is driven by the master cardiac engine singleton:
 * sliders → setEngineParams → every panel rescales together, same frame.
 * Modes: Normal (essential anatomy) | Higher (advanced strain, conduction, valves)
 */

import { useState, useCallback, useEffect, useRef, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { CameraControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import './App.css'
import './styles/tailwind.generated.css'

import ECGGraph from './components/ECGGraph'
import PVLoop from './components/PVLoop'
import StrainPanel from './components/StrainPanel'
import HeatmapLegend from './components/HeatmapLegend'
import HeartModel from './components/HeartModel'
import ChamberHeart from './components/ChamberHeart'
import SlicedHeart from './components/SlicedHeart'
import DeformableHeart from './components/DeformableHeart'
import BloodFlowSystem from './components/three/BloodFlowSystem'
import VascularSystem from './components/three/VascularSystem'
import ThoraxFramework from './components/three/ThoraxFramework'
import ViewportToolbar from './components/ViewportToolbar'
import HeaderBar from './components/layout/HeaderBar'
import ControlDock from './components/layout/ControlDock'
import { HeartLabels3D, HeartLabelsHTML, ANATOMY_MARKERS } from './components/HeartLabels'
import { VESSEL_MARKERS } from './data/anatomyRegistry'

import {
  Settings,
  Activity,
  Tag,
  GraduationCap,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Droplets,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Crosshair,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

import EducationHub from './components/education/EducationHub'
import LearningCard from './components/education/LearningCard'
import CauseEffectPopup from './components/education/CauseEffectPopup'
import ModelCredit from './components/ModelCredit'
import { PericardiumSac, InnerChambers, ValveSet } from './components/three/CardiacLayers'
import ConductionSystem from './components/three/ConductionSystem'
import heartSounds from './services/heartSounds'

import useHeartData from './hooks/useHeartData'
import useIsMobile from './hooks/useIsMobile'
import { useLiveVitals } from './hooks/useHeartbeat'

import baselineMetrics from './data/internMetrics'
import {
  startHeartEngine,
  sendPresetToEngine,
  sendSliderParams,
  fetchMetrics
} from './services/apiService'
import {
  setEngineParams,
  setCirculationMode,
  setConductionOverlay,
  freezeAtPhase,
  setEngineSpeed
} from './simulation/cardiacEngine'
import { CARDIAC_RIG } from './data/anatomyRegistry'

// Marker ids living in CARDIAC space (heart-normalised units) — these must be
// mapped through CARDIAC_RIG before driving the camera. Thorax/bone markers
// are already in world space.
const CARDIAC_MARKER_IDS = new Set([...ANATOMY_MARKERS].map(m => m.id))
VESSEL_MARKERS.forEach(m => CARDIAC_MARKER_IDS.add(m.id))

const DEFAULT_PARAMS = {
  Preload: 50,
  Afterload: 50,
  Contractility: 60,
  'Infarct %': 0,
  'Valve Area': 100
}

export default function App() {
  // ── Core UI state ────────────────────────────────────────────────────────
  const [appMode, setAppMode] = useState('normal') // 'normal'(essential) | 'higher'(advanced)
  const [viewMode, setViewMode] = useState('full') // full|chamber|slice|deform
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [heartRate, setHeartRate] = useState(75)
  const [activePreset, setActivePreset] = useState(null)
  const [, setPresetKey] = useState(0) // bump → graphs refetch

  // 3D / patients
  const [customModelURL, setCustomModelURL] = useState(null)
  const [currentPatient, setCurrentPatient] = useState(null)
  const [regionMap, setRegionMap] = useState(null)
  const [selectedChamber, setSelectedChamber] = useState(null)

  // Slice bundle
  const [sliceState, setSliceState] = useState({
    sliceY: 3,
    sliceAxis: 'horizontal',
    sliceMode: false,
    sweeping: false,
    sweepSpeed: 1
  })
  const patchSlice = p => setSliceState(s => ({ ...s, ...p }))

  // Stage extras
  // ── Clean-model defaults ────────────────────────────────────────────────
  // Nothing is drawn between the viewer and the heart until it is asked for.
  // Blood-flow vectors stay on (they travel inside the vessels); the thoracic
  // cage, pericardium and inner shells are opt-in from the toolbar.
  const [showBloodFlow, setShowBloodFlow] = useState(true)
  const [showThorax, setShowThorax] = useState(false)
  const [activeFocus, setActiveFocus] = useState(null)
  const cameraRef = useRef(null)
  const heartGroupRef = useRef()

  // ── Labels: DEFAULT OFF — pure heart model visible ──
  const [showLabels, setShowLabels] = useState(false)

  // ── Auscultation — synthesized heart sounds, off by default ──
  const [soundOn, setSoundOn] = useState(false)
  useEffect(() => {
    heartSounds.setEnabled(soundOn)
  }, [soundOn])

  // ── Deep anatomical layers (Phase-1 enterprise engine) ──
  // Defaults render the heart alone. Skeleton, pericardium and endocardial
  // shells are additive layers the operator enables deliberately.
  const [layers, setLayers] = useState({
    skeleton: false,
    pericardium: false,
    myocardium: true, // outer GLB wall — opacity drops when chambers ON
    chambers: false, // inner endocardial shells
    valves: true, // procedural Tricuspid/Mitral/Aortic/Pulmonary
    arteries: true,
    veins: true,
    conduction: false // SA→AV→His→Purkinje electrophysiology overlay
  })
  const toggleLayer = useCallback((k, v) => setLayers(s => ({ ...s, [k]: v ?? !s[k] })), [])

  // ── Collapsible drawer sidebars + immersive fullscreen ──
  // DEFAULT: both drawers closed on every viewport. The heart is the
  // product — nothing flanks or covers it until the operator asks for it.
  // Re-open chips sit at the stage edges; phones use the bottom nav bar.
  const isMobile = useIsMobile()
  const [dockOpen, setDockOpen] = useState(false)
  const [teleOpen, setTeleOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  // Crossing into the phone layout closes any desktop-opened sheets
  useEffect(() => {
    if (isMobile) {
      setDockOpen(false)
      setTeleOpen(false)
    }
  }, [isMobile])

  useEffect(() => {
    if (!showLabels) setLabelState([])
  }, [showLabels])

  // ── Model-focus: chrome fades out while the cursor is on the canvas ──
  // Rationale: the heart is the product. Panels reappear the instant the
  // pointer leaves the stage, and `focusLock` pins the clean view for
  // classroom projection. Nothing is ever drawn over the model axis.
  const [focusLock, setFocusLock] = useState(false)
  const [pointerOverStage, setPointerOverStage] = useState(false)
  const [chromeHidden, setChromeHidden] = useState(false)
  // The dwell-hint tells the viewer why the panels left. It is shown once
  // per session and self-dismisses, so the model is never obstructed.
  const [showFocusHint, setShowFocusHint] = useState(true)

  useEffect(() => {
    if (focusLock) {
      setChromeHidden(true)
      return
    }
    if (!pointerOverStage) {
      setChromeHidden(false)
      return
    }
    // Short dwell so a cursor crossing the canvas en route to a panel
    // does not flash the layout.
    const t = setTimeout(() => setChromeHidden(true), 320)
    return () => clearTimeout(t)
  }, [pointerOverStage, focusLock])

  // Hint retires after its first appearance — no persistent chrome over the model.
  useEffect(() => {
    if (!chromeHidden || !showFocusHint) return
    const t = setTimeout(() => setShowFocusHint(false), 2600)
    return () => clearTimeout(t)
  }, [chromeHidden, showFocusHint])

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') setFocusLock(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { heartData } = useHeartData()

  // Projected 3D label positions (throttled to ~20 Hz to avoid per-frame renders)
  const [labelState, setLabelState] = useState([])
  const lastProjRef = useRef(0)
  const handleProjected = useCallback(projected => {
    const now = performance.now()
    if (now - lastProjRef.current < 50) return
    lastProjRef.current = now
    setLabelState(projected)
  }, [])

  // Metrics (live backend → bundled static fallback)
  const [liveMetrics, setLiveMetrics] = useState(null)

  // Education-mode state
  const [eduHeartOverride, setEduHeartOverride] = useState(null) // {params, viewMode}
  const [unlocked, setUnlocked] = useState([])
  const [showLockToast, setShowLockToast] = useState(false)
  // FIX(education-modal): dedicated visibility flag — the X button was bound
  // to appMode which never changed, so the panel could never close.
  const [eduOpen, setEduOpen] = useState(false)

  useEffect(() => {
    startHeartEngine()
  }, [])

  // Push slider state → master engine (single source of truth for visuals)
  useEffect(() => {
    setEngineParams({
      preload: params.Preload,
      afterload: params.Afterload,
      contractility: params.Contractility,
      infarct: params['Infarct %'],
      valve: params['Valve Area']
    })
  }, [params])

  useEffect(() => {
    setEngineParams({ heartRate })
  }, [heartRate])

  useEffect(() => {
    fetchMetrics()
      .then(data => {
        if (!data) return
        setLiveMetrics({
          ef: data?.cardiac_function?.EF_pct ?? baselineMetrics.ef,
          edv: data?.cardiac_function?.EDV_mL ?? baselineMetrics.edv,
          esv: data?.cardiac_function?.ESV_mL ?? baselineMetrics.esv,
          sv: data?.cardiac_function?.SV_mL ?? baselineMetrics.sv,
          efStatus: data?.cardiac_function?.EF_status ?? baselineMetrics.efStatus,
          wallThickness: data?.wall_thickness_mm ?? baselineMetrics.wallThickness,
          valveArea: data?.valve_geometry?.annulus_area_mm2 ?? baselineMetrics.valveArea,
          semiMajor: data?.valve_geometry?.semi_major_axis_mm ?? baselineMetrics.semiMajor,
          semiMinor: data?.valve_geometry?.semi_minor_axis_mm ?? baselineMetrics.semiMinor
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/patients/patient085/region_map.json')
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(data => {
        if (data) setRegionMap(data)
      })
  }, [])

  useEffect(() => {
    document.title =
      appMode === 'higher' ? 'CardioTwin-X — Higher Mode' : 'CardioTwin-X — Normal Mode'
  }, [appMode])

  useEffect(() => {
    if (!showLockToast) return
    const t = setTimeout(() => setShowLockToast(false), 2500)
    return () => clearTimeout(t)
  }, [showLockToast])

  const unlock = id => setUnlocked(prev => (prev.includes(id) ? prev : [...prev, id]))

  // ── Derived values ───────────────────────────────────────────────────────
  const activeParams = eduHeartOverride ? eduHeartOverride.params : params
  const activeInfarct = activeParams['Infarct %'] ?? 0
  const activeValve = activeParams['Valve Area'] ?? 100
  const activeHr = eduHeartOverride?.hr ?? heartRate
  const activeEf =
    heartData?.ef ??
    Math.round(
      Math.max(
        10,
        Math.min(
          85,
          (liveMetrics?.ef ?? 60) * (activeParams.Contractility / 60) * (1 - activeInfarct * 0.008)
        )
      )
    )
  const sysBP = Math.round(
    (55 + activeParams.Afterload * 0.55) * (1 + activeParams.Contractility / 350)
  )
  const diaBP = Math.round(48 + activeParams.Afterload * 0.55)
  const activeBaseScale =
    0.85 + (activeParams.Contractility / 100) * 0.35 * (1 - activeInfarct * 0.004)

  const isHigher = appMode === 'higher'

  // Education bridge ─ medication simulator state
  const [activeMed, setActiveMed] = useState(null)
  const medSnapshot = useRef(null)

  const handleDose = useCallback(med => {
    setActivePreset(null)
    setEduHeartOverride(null)
    setParams(prev => {
      medSnapshot.current ??= { params: { ...prev } }
      const next = { ...prev }
      Object.entries(med.fx).forEach(([k, dv]) => {
        next[k] = Math.max(0, Math.min(100, (next[k] ?? 50) + dv))
      })
      sendSliderParams(
        next.Contractility ?? 50,
        next.Afterload ?? 50,
        next['Infarct %'] ?? 0
      ).catch(() => {})
      return next
    })
    if (med.hr) {
      setHeartRate(prev => {
        medSnapshot.current.h ??= prev
        return Math.max(40, Math.min(180, prev + med.hr))
      })
    }
    setActiveMed(med.name)
    setPresetKey(k => k + 1)
  }, [])

  const handleRevert = useCallback(() => {
    const snap = medSnapshot.current
    if (snap?.params) setParams(snap.params)
    if (snap?.h != null) setHeartRate(snap.h)
    medSnapshot.current = null
    setActiveMed(null)
    setPresetKey(k => k + 1)
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSlider = useCallback((label, value) => {
    setActivePreset(null)
    setEduHeartOverride(null)
    setParams(prev => {
      const next = { ...prev, [label]: value }
      sendSliderParams(
        next['Contractility'] ?? 50,
        next['Afterload'] ?? 50,
        next['Infarct %'] ?? 0
      ).catch(() => {})
      return next
    })
    unlock('first_slider')
  }, [])

  const handlePreset = useCallback((values, label) => {
    setEduHeartOverride(null)
    setParams({ ...DEFAULT_PARAMS, ...values })
    setActivePreset(label)
    medSnapshot.current = null // a preset supersedes drug snapshots
    setActiveMed(null)
    setPresetKey(k => k + 1)
    sendPresetToEngine(label).catch(() => {})
    sendSliderParams(
      values['Contractility'] ?? 60,
      values['Afterload'] ?? 50,
      values['Infarct %'] ?? 0
    ).catch(() => {})
    if (/heart failure|dcm|hcm|icm|hfpef|ppcm/i.test(label)) unlock('heart_failure')
    if (/athlete/i.test(label)) unlock('athlete')
    if (/infarction|stemi|\bmi\b/i.test(label)) unlock('mi')
  }, [])

  const handleSelectPatient = useCallback(patient => {
    setCurrentPatient(patient)
    if (patient.meshPath) {
      useGLTF.preload(patient.meshPath)
      setCustomModelURL(patient.meshPath)
    } else {
      setCustomModelURL(null)
    }
  }, [])

  const handleSelectChamber = useCallback(id => {
    setSelectedChamber(prev => {
      const next = prev === id ? null : id
      if (next) unlock(`chamber_${next}`)
      return next
    })
  }, [])

  useEffect(() => {
    if (['LV', 'RV', 'LA', 'RA'].every(c => unlocked.includes(`chamber_${c}`)))
      unlock('chamber_explorer')
  }, [unlocked])

  const handleSliceMode = val => {
    patchSlice({ sliceMode: val })
    if (val) {
      setViewMode('slice')
      unlock('slice_master')
    } else {
      patchSlice({ sliceY: 3, sweeping: false })
      setViewMode('full')
    }
  }

  const toggleStrainView = () =>
    setViewMode(v => {
      if (v === 'deform') return 'full'
      unlock('strain_viewer')
      return 'deform'
    })

  // ── Camera focus (anatomical markers) ────────────────────────────────────
  // Cardiac-space markers are mapped through CARDIAC_RIG so the camera lands
  // on the TRUE world position of the (scaled, seated) anatomy.
  const focusOn = useCallback(
    marker => {
      setActiveFocus(marker.id === activeFocus ? null : marker.id)
      const cc = cameraRef.current
      if (!cc || !cc.camera) return

      const isCardiac = CARDIAC_MARKER_IDS.has(marker.id)
      const world = isCardiac
        ? marker.pos
            .clone()
            .multiplyScalar(CARDIAC_RIG.scale)
            .add(new THREE.Vector3(...CARDIAC_RIG.pos))
        : marker.pos.clone()

      const dir = marker.normal.clone().normalize().multiplyScalar(1.8)
      const camPos = new THREE.Vector3(
        world.x * 1.5 + dir.x,
        world.y * 1.5 + dir.y + 0.15,
        world.z * 1.5 + dir.z + 3.0 // stays at human-scale distance
      )
      cc.setLookAt(camPos.x, camPos.y, camPos.z, world.x, world.y, world.z, true)
    },
    [activeFocus]
  )

  const resetView = () => {
    setActiveFocus(null)
    cameraRef.current?.setLookAt(0, 0, 5, 0, 0, 0, true)
  }

  // Education modules & 3-D scene requests camera focus via this bus event
  // (detail = ANATOMY_MARKERS id · vascular registry id · thorax bone id)
  useEffect(() => {
    const handler = e => {
      const marker =
        ANATOMY_MARKERS.find(m => m.id === e.detail) || VESSEL_MARKERS.find(m => m.id === e.detail)
      if (marker) focusOn(marker)
    }
    window.addEventListener('ct:focus-marker', handler)
    return () => window.removeEventListener('ct:focus-marker', handler)
  }, [focusOn])

  // ── Smooth touchpad zoom (cursor-aware exponential dolly) ────────────────
  // Replaces the fixed-delta zoomBy; works natively with wheel/scroll.
  const smoothZoom = (delta, cursorX, cursorY) => {
    const cc = cameraRef.current
    if (!cc?.camera || !cc.controls) return

    const cam = cc.camera
    const controls = cc.controls

    const camDir = new THREE.Vector3()
    cam.getWorldDirection(camDir)

    const target = new THREE.Vector3(
      (cam.position.x + controls.target.x) / 2,
      (cam.position.y + controls.target.y) / 2,
      (cam.position.z + controls.target.z) / 2
    )

    const move = new THREE.Vector3().copy(camDir).multiplyScalar(delta * 0.3)
    cam.position.add(move)
    controls.target.lerp(target, delta * 0.1)
    controls.update()
  }

  const zoomBy = delta => {
    const cc = cameraRef.current
    if (!cc?.camera || !cc.controls) return
    const cam = cc.camera
    const dir = new THREE.Vector3()
    cam.getWorldDirection(dir)
    cam.position.addScaledVector(dir, delta * 0.3) // smoother scaling
    cc.update(true)
  }

  const handleWheelZoom = useCallback(e => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.8 : -0.8
    smoothZoom(delta, e.clientX, e.clientY)
  }, [])

  // ── Anatomy isolation state ──────────────────────────────────────────────
  const [anatomyIsolation, setAnatomyIsolation] = useState(null) // null = full heart, else label id

  const handleAnatomySelect = labelId => {
    setAnatomyIsolation(prev => (prev === labelId ? null : labelId))
  }

  const returnToHeart = () => setAnatomyIsolation(null)

  // ── On mount: attach smooth wheel listener ────────────────────────────────
  useEffect(() => {
    const canvas = document.querySelector('.stage canvas')
    if (!canvas) return
    canvas.addEventListener('wheel', handleWheelZoom, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheelZoom)
  }, [handleWheelZoom])

  // ── Education bridge ─────────────────────────────────────────────────────
  const handleHeartSync = useCallback((heartParams, hView, extra = {}) => {
    setEduHeartOverride({
      params: { ...DEFAULT_PARAMS, ...(heartParams ?? {}) },
      viewMode: hView ?? 'full',
      hr: extra?.hr
    })
    setViewMode(hView ?? 'full')
    if (extra?.hr) setEngineParams({ heartRate: extra.hr })
    freezeAtPhase(extra?.freezePhase !== undefined ? extra.freezePhase : null)
    setCirculationMode(extra?.circulation ?? 'both')
    if (extra?.conduction !== undefined) setConductionOverlay(extra.conduction)
    setEngineSpeed(extra?.speed ?? 1)
  }, [])

  const closeAllEduTools = useCallback(() => {
    setEduHeartOverride(null)
    setViewMode('full')
    freezeAtPhase(null)
    setCirculationMode('both')
    setConductionOverlay(false)
    setEngineSpeed(1)
  }, [])

  // ── Education modal open/close (FIX: X button + Escape both unmount it) ──
  const openEduHub = useCallback(() => {
    setAppMode('higher')
    setEduOpen(true)
  }, [])

  const closeEduHub = useCallback(() => {
    setEduOpen(false)
    closeAllEduTools()
  }, [closeAllEduTools])

  // ── Immersive fullscreen (Phase-2 §2) ─────────────────────────────────────
  const enterFullscreen = useCallback(() => {
    setDockOpen(false)
    setTeleOpen(false)
    setFullscreen(true)
    try {
      document.documentElement.requestFullscreen?.()?.catch?.(() => {})
    } catch {
      /* iframe/embedded — UI immersion still applies */
    }
  }, [])

  const exitFullscreen = useCallback(() => {
    setFullscreen(false)
    setHudMode(false) // leaving immersion also leaves HUD mode
    // Drawers stay closed — returning from immersion restores the clean stage
    try {
      if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {})
    } catch {
      /* noop */
    }
  }, [])

  // ── Projector / HUD Mode (classroom + VR-browser projection) ─────────────
  // Hides BOTH sidebars, scales NCERT tags + graphs ×2 (CSS .hud-on), and
  // enters browser fullscreen. A click satisfies the fullscreen gesture
  // requirement; Esc / browser-exit clears it via exitFullscreen.
  const [hudMode, setHudMode] = useState(false)
  const hudVitals = useLiveVitals(6)

  const toggleHud = useCallback(() => {
    if (hudMode) {
      setHudMode(false)
      exitFullscreen()
    } else {
      setHudMode(true)
      enterFullscreen()
    }
  }, [hudMode, enterFullscreen, exitFullscreen])

  // Escape closes the education modal FIRST, then exits fullscreen;
  // native-fullscreen exits (browser chrome) also resync our flag.
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return
      if (eduOpen) {
        setEduOpen(false)
        return
      }
      if (fullscreen) exitFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [eduOpen, fullscreen, exitFullscreen])

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && fullscreen) exitFullscreen()
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [fullscreen, exitFullscreen])

  // ══════════════════════════ RENDER ══════════════════════════
  return (
    <div
      className={`app ${fullscreen ? 'fs-on' : ''} ${hudMode ? 'hud-on' : ''} ${isMobile ? 'mobile' : ''} ${chromeHidden ? 'chrome-hidden' : ''}`}
      data-mode={appMode}
    >
      {!fullscreen && (
        <HeaderBar
          appMode={appMode}
          onModeChange={m => {
            setAppMode(m)
            // Don't auto-open education hub on mode switch — let user control
          }}
          fullscreenOn={fullscreen}
          onToggleFullscreen={() => (fullscreen ? exitFullscreen() : enterFullscreen())}
          sysBP={sysBP}
          diaBP={diaBP}
        />
      )}

      <div className={`layout ${!dockOpen ? 'no-left' : ''} ${!teleOpen ? 'no-right' : ''}`}>
        {/* ── Left: Control Dock (collapsible drawer) ── */}
        <ControlDock
          params={activeParams}
          onSlider={handleSlider}
          heartRate={heartRate}
          setHeartRate={setHeartRate}
          activePresetLabel={activePreset}
          onPreset={handlePreset}
          onSelectPatient={handleSelectPatient}
          currentPatient={currentPatient}
          onDose={handleDose}
          activeMed={activeMed}
          onRevert={handleRevert}
          ncertOn={isHigher}
          medsOn={isHigher}
          onHeartSync={handleHeartSync}
          collapsed={!dockOpen || fullscreen || hudMode}
          onToggleCollapse={() => setDockOpen(o => !o)}
          slice={{
            ...sliceState,
            setSliceY: v => patchSlice({ sliceY: v }),
            setSliceAxis: v => patchSlice({ sliceAxis: v }),
            setSliceMode: handleSliceMode,
            setSweeping: v => patchSlice({ sweeping: v }),
            setSweepSpeed: v => patchSlice({ sweepSpeed: v })
          }}
        />

        {/* ── Center: 3D Stage ── */}
        <main
          className="stage"
          onPointerEnter={() => setPointerOverStage(true)}
          onPointerLeave={() => setPointerOverStage(false)}
        >
          {/* Focus badge — hover-focus only; locked focus stays perfectly clean.
              Self-dismisses after its first appearance so nothing lingers over
              the model. */}
          {chromeHidden && !focusLock && showFocusHint && (
            <div className="focus-hint" aria-hidden>
              <Crosshair size={12} strokeWidth={2} />
              <span>Move the cursor off the model to bring the panels back</span>
            </div>
          )}

          <ViewportToolbar
            onZoomIn={() => zoomBy(-0.55)}
            onZoomOut={() => zoomBy(0.75)}
            onResetView={resetView}
            sliceActive={viewMode === 'slice'}
            onToggleSlice={() => handleSliceMode(viewMode !== 'slice')}
            strainActive={viewMode === 'deform'}
            onToggleStrain={toggleStrainView}
            flowOn={showBloodFlow}
            onToggleFlow={() => setShowBloodFlow(f => !f)}
            thoraxOn={showThorax}
            onToggleThorax={() => setShowThorax(t => !t)}
            labelsOn={showLabels}
            onToggleLabels={() => setShowLabels(v => !v)}
            soundOn={soundOn}
            onToggleSound={() => setSoundOn(v => !v)}
            hudOn={hudMode}
            onToggleHud={toggleHud}
            layers={layers}
            onSetLayer={toggleLayer}
            focusTargets={[...ANATOMY_MARKERS, ...VESSEL_MARKERS]}
            onFocus={focusOn}
            activeFocus={activeFocus}
            anatomyOn={!!anatomyIsolation}
            onAnatomy={returnToHeart}
            anatomyLabel={anatomyIsolation}
            focusActive={focusLock}
            onToggleFocus={() => setFocusLock(f => !f)}
          />

          {/* ── Projector/HUD bar: classroom-readable ECG + vitals (×2 scale) ── */}
          {hudMode && (
            <div className="hud-bar">
              <div className="hud-ecg glass-panel">
                <div className="hud-ecg-head">
                  <span className="hud-title">LEAD II · ELECTROCARDIOGRAM</span>
                  <span className={`hud-live ${hudVitals.live ? 'on' : ''}`}>
                    {hudVitals.live ? ' LIVE BACKEND' : ' LOCAL SIM'}
                  </span>
                </div>
                <ECGGraph height={230} ef={hudVitals.ef} heartRate={hudVitals.bpm} />
              </div>
              <div className="hud-vitals">
                <div className="hud-vital">
                  <b>{hudVitals.bpm}</b>
                  <span>BPM</span>
                </div>
                <div className="hud-vital">
                  <b>{hudVitals.ef}%</b>
                  <span>EF</span>
                </div>
                <div className="hud-vital">
                  <b>
                    {hudVitals.sv}
                    <small> mL</small>
                  </b>
                  <span>STROKE VOL</span>
                </div>
                <div className="hud-vital">
                  <b>
                    {hudVitals.co}
                    <small> L/min</small>
                  </b>
                  <span>CARDIAC OUT</span>
                </div>
                <div className="hud-vital">
                  <b>{Math.round(hudVitals.phase * 100)}%</b>
                  <span>CYCLE</span>
                </div>
              </div>
            </div>
          )}

          <div className="canvas-wrap">
            <Canvas
              shadows="percentage"
              dpr={isMobile ? [1, 1.5] : [1, 2]}
              camera={{ position: [0, 0, 5], fov: 45, near: 0.1, far: 100 }}
              gl={{ antialias: true, powerPreference: 'high-performance' }}
            >
              {/* ── Clinical lighting rig ────────────────────────────────────
 Neutral key over a soft fill, with a single restrained
 crimson rim. Tuned so the myocardium reads cleanly on the
 white/slate stage without coloured cast. */}
              <ambientLight intensity={0.55} color="#eef2f7" />
              <hemisphereLight args={['#ffffff', '#dbe3ec', 0.75]} />
              <directionalLight position={[4, 6, 7]} intensity={1.75} color="#ffffff" />
              <directionalLight position={[-6, -3, -5]} intensity={0.55} color="#cdd8e6" />
              <pointLight position={[-5, -2, -4]} intensity={7} distance={14} color="#e3003a" />
              <pointLight position={[0, 3.5, -6]} intensity={9} distance={16} color="#ffffff" />
              <pointLight position={[3, -4, 2]} intensity={5} distance={10} color="#dbe7f5" />
              <spotLight
                position={[0, 7, 4]}
                angle={0.5}
                penumbra={0.85}
                intensity={18}
                distance={18}
                color="#ffffff"
              />

              {/* 3-D projector MUST live inside the Canvas — it drives the
 HTML label overlay positions via onProjected. Mounted ONLY
 while labels are toggled ON (default OFF per spec §1.2). */}
              {showLabels && (
                <HeartLabels3D
                  heartGroupRef={heartGroupRef}
                  onProjected={handleProjected}
                  enabled
                />
              )}

              {/* ── Heart model per view mode ── */}
              <group ref={heartGroupRef}>
                {/* Thoracic skeleton frame — stays at WORLD scale; the cardiac
 rig is scaled INTO it for real anatomical proportions */}
                {viewMode === 'full' && showThorax && layers.skeleton && (
                  <ThoraxFramework visible interactive={showLabels} />
                )}

                {/* ══ CARDIAC RIG — anatomical seating of the whole cardiac
 block: heart + vessels + valves + pericardium + flow all
 share ONE transform (scale .60, left-of-midline, anterior).
 Focus chips / label anchors map through CARDIAC_RIG. */}
                <group position={CARDIAC_RIG.pos} scale={CARDIAC_RIG.scale}>
                  {/* Complete vascular tree — interactive tubes sharing the
 registry curves that drive the blood-flow particles */}
                  {(viewMode === 'full' || viewMode === 'deform') && (
                    <VascularSystem
                      layers={{ arteries: layers.arteries, veins: layers.veins }}
                      interactive={showLabels}
                    />
                  )}

                  {viewMode === 'full' && layers.myocardium && (
                    <HeartModel
                      baseScale={activeBaseScale}
                      heartRate={activeHr}
                      customURL={customModelURL}
                      tissueOpacity={layers.chambers ? 0.52 : 1}
                      showEduTags={showLabels}
                      onSelectPart={handleAnatomySelect}
                    />
                  )}

                  {/* Procedural deep-anatomy layers (dynamic fallback engine) */}
                  {viewMode === 'full' && layers.pericardium && (
                    <PericardiumSac interactive={showLabels} />
                  )}
                  {viewMode === 'full' && layers.chambers && (
                    <InnerChambers interactive={showLabels} />
                  )}
                  {viewMode === 'full' && layers.valves && <ValveSet interactive={showLabels} />}

                  {/* Electrophysiology — ignites with P wave → QRS sweep */}
                  {viewMode === 'full' && <ConductionSystem enabled={layers.conduction} />}

                  {viewMode === 'deform' && (
                    <DeformableHeart
                      baseScale={activeBaseScale}
                      heartRate={activeHr}
                      infarct={activeInfarct}
                      customURL={customModelURL}
                      strainRegions={heartData?.strainRegions ?? null}
                      regionMap={regionMap}
                    />
                  )}

                  {showBloodFlow && viewMode !== 'slice' && <BloodFlowSystem />}
                </group>

                {/* Slice mode stays in raw heart units — its slider Y-coords
 target the un-rigged 2-unit heart */}
                {viewMode === 'slice' && (
                  <Suspense fallback={null}>
                    <SlicedHeart
                      baseScale={activeBaseScale}
                      heartRate={activeHr}
                      sliceY={sliceState.sliceY}
                      sliceAxis={sliceState.sliceAxis}
                      sweeping={sliceState.sweeping}
                      sweepSpeed={sliceState.sweepSpeed}
                      customURL={customModelURL}
                    />
                  </Suspense>
                )}

                {viewMode === 'chamber' && (
                  <ChamberHeart
                    baseScale={activeBaseScale}
                    heartRate={activeHr}
                    onSelectChamber={handleSelectChamber}
                    selectedChamber={selectedChamber}
                    infarct={activeInfarct}
                  />
                )}
              </group>
              <CameraControls
                ref={cameraRef}
                makeDefault
                dollyToCursor={true}
                smoothTime={0.25}
                draggingSmoothTime={0.12}
                minDistance={1.4}
                maxDistance={9}
                maxPolarAngle={Math.PI * 0.85}
                minPolarAngle={Math.PI * 0.15}
              />
            </Canvas>

            {/* HTML overlays above the canvas — minimal labels, no panels */}
            {viewMode === 'full' && showLabels && (
              <HeartLabelsHTML labels={labelState} onFocus={focusOn} />
            )}
            {(viewMode === 'deform' || viewMode === 'chamber') && (
              <HeatmapLegend infarct={activeInfarct} />
            )}

            {/* Edge rails — bring drawers back after sliding them away */}
            {!fullscreen && !dockOpen && (
              <button
                className="edge-tab left"
                onClick={() => setDockOpen(true)}
                title="Slide controls back in"
                aria-label="Open control panel"
              >
                <ChevronRight size={14} strokeWidth={2.2} />
              </button>
            )}
            {!fullscreen && !teleOpen && (
              <button
                className="edge-tab right"
                onClick={() => setTeleOpen(true)}
                title="Slide telemetry back in"
                aria-label="Open telemetry panel"
              >
                <ChevronLeft size={14} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </main>

        {/* ── Right: Telemetry & Analytics (collapsible drawer) ── */}
        <aside className={`telemetry ${!teleOpen || fullscreen || hudMode ? 'slid' : ''}`}>
          <div className="panel-strip">
            <span className="panel-strip-label">TELEMETRY</span>
            <button
              className="strip-btn"
              onClick={() => setTeleOpen(false)}
              title="Slide panel away"
              aria-label="Collapse telemetry panel"
            >
              <ChevronRight size={12} strokeWidth={2.2} />
            </button>
          </div>
          <div className="tele-inner">
            <div className="tele-card">
              <ECGGraph
                heartRate={activeHr}
                ef={activeEf}
                infarct={activeInfarct}
                height={isMobile ? 96 : 132}
              />
            </div>
            <div className="tele-card">
              <PVLoop
                preload={activeParams.Preload}
                afterload={activeParams.Afterload}
                heartRate={activeHr}
                infarct={activeInfarct}
                valve={activeValve}
                ef={activeEf}
                height={isMobile ? 118 : 158}
              />
            </div>
            <div className="tele-card">
              <StrainPanel infarct={activeInfarct} />
            </div>
          </div>
        </aside>
      </div>

      {/* ── Immersive fullscreen bottom dock ── */}
      {fullscreen && (
        <div className="immersive-dock">
          <button
            className="id-btn"
            onClick={() => zoomBy(-0.55)}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn size={15} strokeWidth={2} />
          </button>
          <button
            className="id-btn"
            onClick={() => zoomBy(0.75)}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut size={15} strokeWidth={2} />
          </button>
          <button
            className="id-btn"
            onClick={resetView}
            title="Reset camera"
            aria-label="Reset camera"
          >
            <RotateCcw size={14} strokeWidth={2} />
          </button>
          <i className="id-sep" />
          <button
            className={`id-btn ${soundOn ? 'on' : ''}`}
            onClick={() => setSoundOn(v => !v)}
            title={soundOn ? 'Mute heart sounds' : 'Play heart sounds'}
            aria-label="Heart sounds"
            aria-pressed={soundOn}
          >
            {soundOn ? (
              <Volume2 size={15} strokeWidth={2} />
            ) : (
              <VolumeX size={15} strokeWidth={2} />
            )}
          </button>
          <button
            className={`id-btn ${showLabels ? 'on' : ''}`}
            onClick={() => setShowLabels(v => !v)}
            title="Toggle anatomical labels"
            aria-label="Anatomical labels"
            aria-pressed={showLabels}
          >
            <Tag size={15} strokeWidth={2} />
          </button>
          <button
            className={`id-btn flow ${showBloodFlow ? 'on' : ''}`}
            onClick={() => setShowBloodFlow(f => !f)}
            title="Blood-flow vectors"
            aria-label="Blood-flow vectors"
            aria-pressed={showBloodFlow}
          >
            <Droplets size={15} strokeWidth={2} />
          </button>
          <i className="id-sep" />
          <button className="id-btn exit" onClick={exitFullscreen} aria-label="Exit immersive view">
            <Minimize2 size={13} strokeWidth={2.2} />
            <span>Exit</span>
          </button>
        </div>
      )}

      {/* ── Mobile: tap-away scrim under slide-over sheets ── */}
      {isMobile && !fullscreen && (dockOpen || teleOpen) && (
        <div
          className="mobile-scrim"
          onClick={() => {
            setDockOpen(false)
            setTeleOpen(false)
          }}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile bottom navigation (thumb-reachable, 48px+ targets) ── */}
      {isMobile && !fullscreen && (
        <nav className="mnav" aria-label="Mobile navigation">
          <button
            className={`mnav-btn ${dockOpen ? 'on' : ''}`}
            onClick={() => {
              setTeleOpen(false)
              setDockOpen(o => !o)
            }}
          >
            <Settings size={18} strokeWidth={1.5} />
            <span>Controls</span>
          </button>
          <button
            className={`mnav-btn ${teleOpen ? 'on' : ''}`}
            onClick={() => {
              setDockOpen(false)
              setTeleOpen(o => !o)
            }}
          >
            <Activity size={18} strokeWidth={1.5} />
            <span>Vitals</span>
          </button>
          <button
            className={`mnav-btn ${showLabels ? 'on' : ''}`}
            onClick={() => setShowLabels(v => !v)}
          >
            <Tag size={18} strokeWidth={1.5} />
            <span>Labels</span>
          </button>
          <button
            className={`mnav-btn ${appMode === 'higher' && eduOpen ? 'on' : ''}`}
            onClick={() => {
              if (appMode === 'higher' && eduOpen) {
                closeEduHub()
                return
              }
              setDockOpen(false)
              setTeleOpen(false)
              openEduHub()
            }}
          >
            <GraduationCap size={18} strokeWidth={1.5} />
            <span>Edu</span>
          </button>
          <button className="mnav-btn" onClick={enterFullscreen}>
            <Maximize2 size={18} strokeWidth={1.5} />
            <span>Immerse</span>
          </button>
        </nav>
      )}

      {/* ── Education overlays (FIX: gated by dedicated eduOpen flag so the
 button, Escape key and mode switch all close it cleanly) ── */}
      {isHigher && eduOpen && (
        <>
          <EducationHub unlocked={unlocked} onClose={closeEduHub} onHeartSync={handleHeartSync} />
          <LearningCard selected={selectedChamber} onClose={() => setSelectedChamber(null)} />
          <CauseEffectPopup trigger={activePreset} />
        </>
      )}

      {/* Reopen pill when the hub is closed but still in Higher Mode */}
      {isHigher && !eduOpen && !fullscreen && (
        <button className="edu-fab" onClick={openEduHub}>
          Higher Mode Lessons
          <span className="edu-fab-sub">Body Fluids &amp; Circulation</span>
        </button>
      )}

      {/* ── Lock toast ── */}
      {showLockToast && (
        <div className="lock-toast">
          Switch to<span className="lock-toast-accent">Higher Mode</span>to unlock this view
        </div>
      )}

      {/* ── Licence attribution — collapsed chip; expands only on click ── */}
      <ModelCredit />
    </div>
  )
}
