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

import useHeartData from './hooks/useHeartData'

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
  const focusOn = useCallback(marker => {
    setActiveFocus(marker.id === activeFocus ? null : marker.id)
    const cc = cameraRef.current
    if (!cc || !cc.camera) return
    const dir = marker.normal.clone().normalize().multiplyScalar(1.8)
    const camPos = new THREE.Vector3(
      marker.pos.x * 1.5 + dir.x,
      marker.pos.y * 1.5 + dir.y + 0.15,
      marker.pos.z * 1.5 + dir.z + 3.0,   // stays at human-scale distance
    )
    cc.setLookAt(camPos.x, camPos.y, camPos.z, marker.pos.x, marker.pos.y, marker.pos.z, true)
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

  // ══════════════════════════ RENDER ══════════════════════════
  return (
    <div className="app" data-mode={appMode}>

      <HeaderBar
        appMode={appMode}
        onModeChange={m => { setAppMode(m); if (m === 'clinical') closeAllEduTools() }}
        sysBP={sysBP} diaBP={diaBP}
      />

      <div className="layout">

        {/* ── Left: Control Dock ── */}
        <ControlDock
          params={activeParams}
          onSlider={handleSlider}
          heartRate={heartRate}
          setHeartRate={setHeartRate}
          activePresetLabel={activePreset}
          onPreset={handlePreset}
          onSelectPatient={handleSelectPatient}
          currentPatient={currentPatient}
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
            focusTargets={[...ANATOMY_MARKERS, ...VESSEL_MARKERS]}
            onFocus={focusOn}
            activeFocus={activeFocus}
          />

          <div className="canvas-wrap">
            <Canvas
              shadows="percentage"
              dpr={[1, 2]}
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
                  HTML label overlay positions via onProjected */}
              <HeartLabels3D
                heartGroupRef={heartGroupRef}
                onProjected={handleProjected}
              />

              {/* ── Heart model per view mode ── */}
              <group ref={heartGroupRef}>
                {/* Thoracic skeleton frame — anatomical scale context (full view) */}
                {viewMode === 'full' && (
                  <ThoraxFramework visible={showThorax} />
                )}

                {/* Complete vascular tree — interactive tubes sharing the
                    registry curves that drive the blood-flow particles */}
                {(viewMode === 'full' || viewMode === 'deform') && (
                  <VascularSystem />
                )}

                {viewMode === 'full' && (
                  <HeartModel
                    baseScale={activeBaseScale}
                    heartRate={activeHr}
                    customURL={customModelURL}
                  />
                )}
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
            {viewMode === 'full' && (
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
          </div>
        </main>

        {/* ── Right: Telemetry & Analytics ── */}
        <aside className="telemetry">
          <div className="tele-card">
            <ECGGraph heartRate={activeHr} ef={activeEf} infarct={activeInfarct} height={132} />
          </div>
          <div className="tele-card">
            <PVLoop
              preload={activeParams.Preload} afterload={activeParams.Afterload}
              heartRate={activeHr} infarct={activeInfarct}
              valve={activeValve} ef={activeEf} height={158}
            />
          </div>
          <div className="tele-card">
            <StrainPanel infarct={activeInfarct} />
          </div>
        </aside>
      </div>

      {/* ── Education overlays ── */}
      {isEducation && (
        <>
          <EducationHub
            unlocked={unlocked}
            onClose={closeAllEduTools}
            onHeartSync={handleHeartSync}
          />
          <LearningCard selected={selectedChamber} onClose={() => setSelectedChamber(null)} />
          <CauseEffectPopup trigger={activePreset} />
        </>
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




