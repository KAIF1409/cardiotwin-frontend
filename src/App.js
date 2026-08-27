/**
 * App.js — CardioTwin-X Clinical Suite  (v5 · glassmorphism rebuild)
 * ══════════════════════════════════════════════════════════════════
 * ARCHITECTURE
 *   ┌ HeaderBar ── live WS badge · BPM meter · BP/EF chips · mode switch
 *   ├ ControlDock (left) ── patient · hemodynamic sliders · presets · slice
 *   ├ Stage (center)     ── 3D viewport + floating glass toolbar + labels
 *   ├ Telemetry (right)  ── ECG · PV loop · strain cards
 *   └ Overlays           ── education hub (SSLC / PUC), popups, toasts
 *
 * ALL animation is driven by the master cardiac engine singleton:
 * sliders → setEngineParams → every panel rescales together, same frame.
 */

import { useState, useCallback, useEffect, useRef, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { CameraControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import './App.css'

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

import EducationHub from './components/education/EducationHub'
import LearningCard from './components/education/LearningCard'
import CauseEffectPopup from './components/education/CauseEffectPopup'
import { PericardiumSac, InnerChambers, ValveSet } from './components/three/CardiacLayers'

import useHeartData from './hooks/useHeartData'
import useIsMobile from './hooks/useIsMobile'

import baselineMetrics from './data/internMetrics'
import {
  startHeartEngine,
  sendPresetToEngine,
  sendSliderParams,
  fetchMetrics,
} from './services/apiService'
import {
  setEngineParams,
  setCirculationMode,
  setConductionOverlay,
  freezeAtPhase,
  setEngineSpeed,
} from './simulation/cardiacEngine'
import { CARDIAC_RIG } from './data/anatomyRegistry'

// Marker ids living in CARDIAC space (heart-normalised units) — these must be
// mapped through CARDIAC_RIG before driving the camera. Thorax/bone markers
// are already in world space.
const CARDIAC_MARKER_IDS = new Set(
  [...ANATOMY_MARKERS].map(m => m.id),
)
VESSEL_MARKERS.forEach(m => CARDIAC_MARKER_IDS.add(m.id))

const DEFAULT_PARAMS = {
  Preload: 50, Afterload: 50, Contractility: 60,
  'Infarct %': 0, 'Valve Area': 100,
}

export default function App() {
  // ── Core UI state ────────────────────────────────────────────────────────
  const [appMode, setAppMode] = useState('clinical')
  const [viewMode, setViewMode] = useState('full')          // full|chamber|slice|deform
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [heartRate, setHeartRate] = useState(75)
  const [activePreset, setActivePreset] = useState(null)
  const [, setPresetKey] = useState(0)                      // bump → graphs refetch

  // 3D / patients
  const [customModelURL, setCustomModelURL] = useState(null)
  const [currentPatient, setCurrentPatient] = useState(null)
  const [regionMap, setRegionMap] = useState(null)
  const [selectedChamber, setSelectedChamber] = useState(null)

  // Slice bundle
  const [sliceState, setSliceState] = useState({
    sliceY: 3, sliceAxis: 'horizontal', sliceMode: false,
    sweeping: false, sweepSpeed: 1,
  })
  const patchSlice = p => setSliceState(s => ({ ...s, ...p }))

  // Stage extras
  const [showBloodFlow, setShowBloodFlow] = useState(true)
  const [showThorax, setShowThorax]       = useState(true)
  const [activeFocus, setActiveFocus] = useState(null)
  const cameraRef = useRef(null)
  const heartGroupRef = useRef()

  // ── On-demand labels — DEFAULT OFF per spec §1.2 ──
  const [showLabels, setShowLabels] = useState(false)

  // ── Deep anatomical layers (Phase-1 enterprise engine) ──
  const [layers, setLayers] = useState({
    skeleton:    true,
    pericardium: true,
    myocardium:  true,     // outer GLB wall — opacity drops when chambers ON
    chambers:    false,    // inner endocardial shells
    valves:      true,     // procedural Tricuspid/Mitral/Aortic/Pulmonary
    arteries:    true,
    veins:       true,
  })
  const toggleLayer = useCallback((k, v) =>
    setLayers(s => ({ ...s, [k]: v ?? !s[k] })), [])

  // ── Collapsible drawer sidebars + immersive fullscreen ──
  // On phones (≤900px) both panels open as slide-over SHEETS over the
  // canvas, driven by a bottom navigation bar; they start closed there.
  const isMobile = useIsMobile()
  const [dockOpen, setDockOpen] = useState(() => !window.matchMedia('(max-width: 900px)').matches)
  const [teleOpen, setTeleOpen] = useState(() => !window.matchMedia('(max-width: 900px)').matches)
  const [fullscreen, setFullscreen] = useState(false)

  // Crossing into the phone layout closes any desktop-opened sheets
  useEffect(() => {
    if (isMobile) { setDockOpen(false); setTeleOpen(false) }
  }, [isMobile])

  useEffect(() => { if (!showLabels) setLabelState([]) }, [showLabels])

  // Live backend data
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

  useEffect(() => { startHeartEngine() }, [])

  // Push slider state → master engine (single source of truth for visuals)
  useEffect(() => {
    setEngineParams({
      preload:       params.Preload,
      afterload:     params.Afterload,
      contractility: params.Contractility,
      infarct:       params['Infarct %'],
      valve:         params['Valve Area'],
    })
  }, [params])

  useEffect(() => { setEngineParams({ heartRate }) }, [heartRate])

  useEffect(() => {
    fetchMetrics().then(data => {
      if (!data) return
      setLiveMetrics({
        ef:            data?.cardiac_function?.EF_pct    ?? baselineMetrics.ef,
        edv:           data?.cardiac_function?.EDV_mL    ?? baselineMetrics.edv,
        esv:           data?.cardiac_function?.ESV_mL    ?? baselineMetrics.esv,
        sv:            data?.cardiac_function?.SV_mL     ?? baselineMetrics.sv,
        efStatus:      data?.cardiac_function?.EF_status ?? baselineMetrics.efStatus,
        wallThickness: data?.wall_thickness_mm           ?? baselineMetrics.wallThickness,
        valveArea:     data?.valve_geometry?.annulus_area_mm2   ?? baselineMetrics.valveArea,
        semiMajor:     data?.valve_geometry?.semi_major_axis_mm ?? baselineMetrics.semiMajor,
        semiMinor:     data?.valve_geometry?.semi_minor_axis_mm ?? baselineMetrics.semiMinor,
      })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/patients/patient085/region_map.json')
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then(data => { if (data) setRegionMap(data) })
  }, [])

  useEffect(() => {
    document.title =
      appMode === 'education' ? 'CardioTwin-X — Education' : 'CardioTwin-X — Clinical Suite'
  }, [appMode])

  useEffect(() => {
    if (!showLockToast) return
    const t = setTimeout(() => setShowLockToast(false), 2500)
    return () => clearTimeout(t)
  }, [showLockToast])

  const unlock = id =>
    setUnlocked(prev => prev.includes(id) ? prev : [...prev, id])

  // ── Derived values ───────────────────────────────────────────────────────
  const activeParams  = eduHeartOverride ? eduHeartOverride.params : params
  const activeInfarct = activeParams['Infarct %'] ?? 0
  const activeValve   = activeParams['Valve Area'] ?? 100
  const activeHr      = eduHeartOverride?.hr ?? heartRate
  const activeEf      = heartData?.ef ?? Math.round(Math.max(10, Math.min(85,
        ((liveMetrics?.ef ?? 60) * (activeParams.Contractility / 60)) * (1 - activeInfarct * 0.008))))
  const sysBP = Math.round((55 + activeParams.Afterload * 0.55) * (1 + activeParams.Contractility / 350))
  const diaBP = Math.round(48 + activeParams.Afterload * 0.55)
  const activeBaseScale = 0.85 + (activeParams.Contractility / 100) * 0.35 * (1 - activeInfarct * 0.004)

  const isEducation = appMode === 'education'

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSlider = useCallback((label, value) => {
    setActivePreset(null)
    setEduHeartOverride(null)
    setParams(prev => {
      const next = { ...prev, [label]: value }
      sendSliderParams(
        next['Contractility'] ?? 50,
        next['Afterload'] ?? 50,
        next['Infarct %'] ?? 0,
      ).catch(() => {})
      return next
    })
    unlock('first_slider')
  }, [])

  const handlePreset = useCallback((values, label) => {
    setEduHeartOverride(null)
    setParams({ ...DEFAULT_PARAMS, ...values })
    setActivePreset(label)
    setPresetKey(k => k + 1)
    sendPresetToEngine(label).catch(() => {})
    sendSliderParams(
      values['Contractility'] ?? 60,
      values['Afterload'] ?? 50,
      values['Infarct %'] ?? 0,
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
    if (['LV', 'RV', 'LA', 'RA'].every(c => unlocked.includes(`chamber_${c}`))) unlock('chamber_explorer')
  }, [unlocked])

  const handleSliceMode = val => {
    patchSlice({ sliceMode: val })
    if (val) { setViewMode('slice'); unlock('slice_master') }
    else { patchSlice({ sliceY: 3, sweeping: false }); setViewMode('full') }
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
  const focusOn = useCallback(marker => {
    setActiveFocus(marker.id === activeFocus ? null : marker.id)
    const cc = cameraRef.current
    if (!cc || !cc.camera) return

    const isCardiac = CARDIAC_MARKER_IDS.has(marker.id)
    const world = isCardiac
      ? marker.pos.clone()
          .multiplyScalar(CARDIAC_RIG.scale)
          .add(new THREE.Vector3(...CARDIAC_RIG.pos))
      : marker.pos.clone()

    const dir = marker.normal.clone().normalize().multiplyScalar(1.8)
    const camPos = new THREE.Vector3(
      world.x * 1.5 + dir.x,
      world.y * 1.5 + dir.y + 0.15,
      world.z * 1.5 + dir.z + 3.0,   // stays at human-scale distance
    )
    cc.setLookAt(camPos.x, camPos.y, camPos.z, world.x, world.y, world.z, true)
  }, [activeFocus])

  const resetView = () => {
    setActiveFocus(null)
    cameraRef.current?.setLookAt(0, 0, 5, 0, 0, 0, true)
  }

  // Education modules & 3-D scene requests camera focus via this bus event
  // (detail = ANATOMY_MARKERS id · vascular registry id · thorax bone id)
  useEffect(() => {
    const handler = e => {
      const marker =
        ANATOMY_MARKERS.find(m => m.id === e.detail) ||
        VESSEL_MARKERS.find(m => m.id === e.detail)
      if (marker) focusOn(marker)
    }
    window.addEventListener('ct:focus-marker', handler)
    return () => window.removeEventListener('ct:focus-marker', handler)
  }, [focusOn])

  const zoomBy = delta => {
    const cc = cameraRef.current
    if (!cc?.camera) return
    const dir = new THREE.Vector3()
    cc.camera.getWorldDirection(dir)
    cc.camera.position.addScaledVector(dir, delta)
    cc.update(true)
  }

  // ── Education bridge ─────────────────────────────────────────────────────
  const handleHeartSync = useCallback((heartParams, hView, extra = {}) => {
    setEduHeartOverride({ params: { ...DEFAULT_PARAMS, ...(heartParams ?? {}) }, viewMode: hView ?? 'full', hr: extra?.hr })
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
    setAppMode('education')
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
    } catch { /* iframe/embedded — UI immersion still applies */ }
  }, [])

  const exitFullscreen = useCallback(() => {
    setFullscreen(false)
    setDockOpen(true)
    setTeleOpen(true)
    try {
      if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {})
    } catch { /* noop */ }
  }, [])

  // Escape closes the education modal FIRST, then exits fullscreen;
  // native-fullscreen exits (browser chrome) also resync our flag.
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return
      if (eduOpen)          { setEduOpen(false); return }
      if (fullscreen)       exitFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [eduOpen, fullscreen, exitFullscreen])

  useEffect(() => {
    const onFsChange = () => { if (!document.fullscreenElement && fullscreen) exitFullscreen() }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [fullscreen, exitFullscreen])

  // ══════════════════════════ RENDER ══════════════════════════
  return (
    <div className={`app ${fullscreen ? 'fs-on' : ''} ${isMobile ? 'mobile' : ''}`} data-mode={appMode}>

      {!fullscreen && (
        <HeaderBar
          appMode={appMode}
          onModeChange={m => {
            setAppMode(m)
            if (m === 'education') setEduOpen(true)   // opening education = open hub
            else { setEduOpen(false); closeAllEduTools() }
          }}
          fullscreenOn={fullscreen}
          onToggleFullscreen={() => (fullscreen ? exitFullscreen() : enterFullscreen())}
          sysBP={sysBP} diaBP={diaBP}
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
          collapsed={!dockOpen || fullscreen}
          onToggleCollapse={() => setDockOpen(o => !o)}
          slice={{
            ...sliceState,
            setSliceY: v => patchSlice({ sliceY: v }),
            setSliceAxis: v => patchSlice({ sliceAxis: v }),
            setSliceMode: handleSliceMode,
            setSweeping: v => patchSlice({ sweeping: v }),
            setSweepSpeed: v => patchSlice({ sweepSpeed: v }),
          }}
        />

        {/* ── Center: 3D Stage ── */}
        <main className="stage">
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
            layers={layers}
            onSetLayer={toggleLayer}
            focusTargets={[...ANATOMY_MARKERS, ...VESSEL_MARKERS]}
            onFocus={focusOn}
            activeFocus={activeFocus}
          />

          <div className="canvas-wrap">
            <Canvas
              shadows="percentage"
              dpr={isMobile ? [1, 1.5] : [1, 2]}
              camera={{ position: [0, 0, 5], fov: 45, near: 0.1, far: 100 }}
              gl={{ antialias: true, powerPreference: 'high-performance' }}
            >
              {/* ── Cinematic clinical lighting rig ──────────────────────────
                  Key + fill + dual rim (cyan/crimson) + under-glow, tuned
                  for MeshPhysicalMaterial SSS-style tissue response */}
              <ambientLight intensity={0.34} color="#b8c6e0" />
              <directionalLight position={[4, 6, 7]} intensity={1.55} color="#eaf4ff" />
              <directionalLight position={[-6, -3, -5]} intensity={0.45} color="#8fb0ff" />
              <pointLight position={[-5, -2, -4]} intensity={16} distance={14} color="#FF2E93" />
              <pointLight position={[0, 3.5, -6]} intensity={20} distance={16} color="#00F2FE" />
              <pointLight position={[3, -4, 2]}  intensity={9}  distance={10} color="#0055FF" />
              <spotLight position={[0, 7, 4]} angle={0.5} penumbra={0.85}
                         intensity={26} distance={18} color="#fff4ea" />

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
                  <ThoraxFramework visible />
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
                    />
                  )}

                  {viewMode === 'full' && layers.myocardium && (
                    <HeartModel
                      baseScale={activeBaseScale}
                      heartRate={activeHr}
                      customURL={customModelURL}
                      tissueOpacity={layers.chambers ? 0.52 : 1}
                    />
                  )}

                  {/* Procedural deep-anatomy layers (dynamic fallback engine) */}
                  {viewMode === 'full' && layers.pericardium && <PericardiumSac />}
                  {viewMode === 'full' && layers.chambers     && <InnerChambers />}
                  {viewMode === 'full' && layers.valves       && <ValveSet />}

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

                  {showBloodFlow && viewMode !== 'slice' && (
                    <BloodFlowSystem />
                  )}
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
                dollyToCursor={false}
                smoothTime={0.35}
                minDistance={1.4}
                maxDistance={9}
              />
            </Canvas>

            {/* HTML overlays above the canvas */}
            {viewMode === 'full' && showLabels && (
              <HeartLabelsHTML
                labels={labelState}
                selectedChamber={selectedChamber}
                onSelectChamber={handleSelectChamber}
                ef={activeEf}
                edv={Math.round(70 + activeParams.Preload * 0.9)}
                esv={Math.round((70 + activeParams.Preload * 0.9) * (1 - activeEf / 100))}
                contractility={activeParams.Contractility}
              />
            )}
            {(viewMode === 'deform' || viewMode === 'chamber') && (
              <HeatmapLegend infarct={activeInfarct} />
            )}

            {/* Edge rails — bring drawers back after sliding them away */}
            {!fullscreen && !dockOpen && (
              <button className="edge-tab left" onClick={() => setDockOpen(true)}
                      title="Slide controls back in">▶</button>
            )}
            {!fullscreen && !teleOpen && (
              <button className="edge-tab right" onClick={() => setTeleOpen(true)}
                      title="Slide telemetry back in">◀</button>
            )}
          </div>
        </main>

        {/* ── Right: Telemetry & Analytics (collapsible drawer) ── */}
        <aside className={`telemetry ${!teleOpen || fullscreen ? 'slid' : ''}`}>
          <div className="panel-strip">
            <span className="panel-strip-label">TELEMETRY</span>
            <button className="strip-btn" onClick={() => setTeleOpen(false)}
                    title="Slide panel away">▶</button>
          </div>
          <div className="tele-inner">
            <div className="tele-card">
              <ECGGraph heartRate={activeHr} ef={activeEf} infarct={activeInfarct}
                        height={isMobile ? 96 : 132} />
            </div>
            <div className="tele-card">
              <PVLoop
                preload={activeParams.Preload} afterload={activeParams.Afterload}
                heartRate={activeHr} infarct={activeInfarct}
                valve={activeValve} ef={activeEf}
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
          <button className="id-btn" onClick={() => zoomBy(-0.55)} title="Zoom in">＋</button>
          <button className="id-btn" onClick={() => zoomBy(0.75)} title="Zoom out">－</button>
          <button className="id-btn" onClick={resetView} title="Reset camera">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M3 12a9 9 0 1 0 3-6.7" strokeLinecap="round"/>
              <path d="M3 4v5h5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <i className="id-sep" />
          <button
            className={`id-btn ${showLabels ? 'on' : ''}`}
            onClick={() => setShowLabels(v => !v)}
            title="Toggle anatomical labels"
          >🏷️</button>
          <button
            className={`id-btn flow ${showBloodFlow ? 'on' : ''}`}
            onClick={() => setShowBloodFlow(f => !f)}
            title="Blood-flow vectors"
          >🩸</button>
          <i className="id-sep" />
          <button className="id-btn exit" onClick={exitFullscreen}>
            ⤢ Exit Fullscreen
          </button>
        </div>
      )}

      {/* ── Mobile: tap-away scrim under slide-over sheets ── */}
      {isMobile && !fullscreen && (dockOpen || teleOpen) && (
        <div
          className="mobile-scrim"
          onClick={() => { setDockOpen(false); setTeleOpen(false) }}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile bottom navigation (thumb-reachable, 48px+ targets) ── */}
      {isMobile && !fullscreen && (
        <nav className="mnav" aria-label="Mobile navigation">
          <button
            className={`mnav-btn ${dockOpen ? 'on' : ''}`}
            onClick={() => { setTeleOpen(false); setDockOpen(o => !o) }}
          >⚙️<span>Controls</span></button>
          <button
            className={`mnav-btn ${teleOpen ? 'on' : ''}`}
            onClick={() => { setDockOpen(false); setTeleOpen(o => !o) }}
          >📊<span>Vitals</span></button>
          <button
            className={`mnav-btn ${showLabels ? 'on' : ''}`}
            onClick={() => setShowLabels(v => !v)}
          >🏷️<span>Labels</span></button>
          <button
            className={`mnav-btn ${appMode === 'education' && eduOpen ? 'on' : ''}`}
            onClick={() => {
              if (appMode === 'education' && eduOpen) { closeEduHub(); return }
              setDockOpen(false); setTeleOpen(false)
              openEduHub()
            }}
          >🎓<span>Edu</span></button>
          <button className="mnav-btn" onClick={enterFullscreen}>⛶<span>Immerse</span></button>
        </nav>
      )}

      {/* ── Education overlays (FIX: gated by dedicated eduOpen flag so the
              ✕ button, Escape key and mode switch all close it cleanly) ── */}
      {isEducation && eduOpen && (
        <>
          <EducationHub
            unlocked={unlocked}
            onClose={closeEduHub}
            onHeartSync={handleHeartSync}
          />
          <LearningCard selected={selectedChamber} onClose={() => setSelectedChamber(null)} />
          <CauseEffectPopup trigger={activePreset} />
        </>
      )}

      {/* Reopen pill when the hub is closed but still in Education Mode */}
      {isEducation && !eduOpen && !fullscreen && (
        <button className="edu-fab" onClick={openEduHub}>
          🎓 Education Hub
          <span className="edu-fab-sub">SSLC · PUC tracks</span>
        </button>
      )}

      {/* ── Lock toast ── */}
      {showLockToast && (
        <div className="lock-toast">
          🔒 Switch to <span className="lock-toast-accent">🎓 Education Mode</span> to unlock this view
        </div>
      )}
    </div>
  )
}




