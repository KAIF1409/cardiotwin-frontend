/**
 * App.js  —  FIXED
 * =================
 * FIXES APPLIED
 * -------------
 * FIX 1 — handleSlider() now calls sendSliderParams() so every slider move
 *          POSTs { contractility, afterload, infarct_pct } to the backend
 *          POST /params endpoint.  Previously sliders only updated React
 *          state; the HeartEngine physics simulation was never told about them.
 *
 * FIX 2 — useHeartData() called without arguments.  The original code
 *          passed `params` to useHeartData(params) but the hook accepts no
 *          arguments — it subscribes to the global apiService bus.
 *
 * FIX 3 — Added fetchMetrics() call on mount to pull live patient MRI
 *          baseline from GET /metrics.  Falls back to bundled static
 *          baselineMetrics if the backend is offline.
 *
 * FIX 4 — sendPresetToEngine() is still called on preset selection — the
 *          expanded presetMap in apiService.js now handles all subcategories.
 *          Additionally, after applying any preset, sendSliderParams() is also
 *          called with the preset's translated values so the backend engine
 *          state is always in sync with what the UI shows.
 *
 * FIX 5 — region_map.json fetched on mount and stored in state.
 *          Passed as `regionMap` prop to DeformableHeart so it can apply
 *          per-region strain deformation.  Without this, DeformableHeart
 *          cannot know which mesh corresponds to LV, RV, MYO.
 *
 * FIX 6 — heartData.strainRegions passed as `strainRegions` prop to
 *          DeformableHeart.  This is the live per-region strain data from
 *          the backend WebSocket (/state).  DeformableHeart now deforms each
 *          heart mesh region independently — infarcted zone barely moves
 *          while healthy tissue contracts — the key educational moment for MI.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import ECGGraph from './components/ECGGraph'
import PVLoop from './components/PVLoop'
import DiseasePresets from './components/DiseasePresets'
import HeartModel from './components/HeartModel'
import ChamberHeart from './components/ChamberHeart'
import SlicedHeart from './components/SlicedHeart'
import SliceControls from './components/SliceControls'
import CauseEffectPopup from './components/education/CauseEffectPopup'
import useHeartbeat from './hooks/useHeartbeat'
import useHeartData from './hooks/useHeartData'  // FIX 2: called with no args below
import StrainPanel from './components/StrainPanel'
import DeformableHeart from './components/DeformableHeart'
import HeatmapLegend from './components/HeatmapLegend'
import LearningCard from './components/education/LearningCard'
import { HeartLabels3D, HeartLabelsHTML } from './components/HeartLabels'
import GuidedLearning from './components/education/GuidedLearning'
import ComparePanel from './components/education/ComparePanel'
import ProgressTracker from './components/education/ProgressTracker'
import APIStatus from './components/APIStatus'
import FlashcardDeck from './components/education/FlashcardDeck'
import ECGQuiz from './components/education/ECGQuiz'
import ClinicalCases from './components/education/ClinicalCases'
import PatientSelector from './components/PatientSelector'
import baselineMetrics from './data/internMetrics'
import {
  startHeartEngine,
  sendPresetToEngine,
  sendSliderParams,   // FIX 1: new export from fixed apiService.js
  fetchMetrics,       // FIX 3: new export from fixed apiService.js
} from './services/apiService'
import './App.css'

// Preload default GLB so all view modes hit cache — no reload flash
useGLTF.preload('/models/heart.glb')

const SLIDERS = [
  { label: 'Preload',       color: '#00bcd4' },
  { label: 'Afterload',     color: '#ff9800' },
  { label: 'Contractility', color: '#ab47bc' },
  { label: 'Infarct %',     color: '#ef5350' },
  { label: 'Valve Area',    color: '#00e676' },
]

const VIEW_MODES = [
  { id: 'full',    label: '🫀 Full',     desc: 'Full heart model',  eduOnly: false },
  { id: 'chamber', label: '🔬 Chambers', desc: 'Isolate chambers',  eduOnly: true  },
  { id: 'slice',   label: '✂️ Slice',    desc: 'Cross-section',     eduOnly: true  },
  { id: 'deform',  label: '🧬 Strain',   desc: 'Strain heatmap',    eduOnly: true  },
]

export default function App() {
  // ── Clinical params ──────────────────────────────────────────────
  const [params, setParams] = useState({
    Preload: 50, Afterload: 50, Contractility: 50,
    'Infarct %': 0, 'Valve Area': 100,
  })
  const [activePreset,    setActivePreset]    = useState('✅ Normal')
  const [selectedChamber, setSelectedChamber] = useState(null)
  const [viewMode,        setViewMode]        = useState('full')
  const [sliceY,          setSliceY]          = useState(3)
  const [sliceAxis,       setSliceAxis]       = useState('horizontal')
  const [sliceMode,       setSliceMode]       = useState(false)
  const [sweeping,        setSweeping]        = useState(false)
  const [sweepSpeed,      setSweepSpeed]      = useState(1)
  const [customModelURL,  setCustomModelURL]  = useState(null)
  const [currentPatient,  setCurrentPatient]  = useState(null)

  // FIX 3 — Live metrics from backend GET /metrics
  const [liveMetrics, setLiveMetrics] = useState(null)

  // FIX 5 — region_map.json for per-region heart deformation
  const [regionMap, setRegionMap] = useState(null)

  // PRESET KEY — increments every time a disease preset is selected.
  // Passed to ECGGraph and PVLoop so they know to flush cached data
  // and re-fetch /simulate_cycle with the new disease parameters.
  const [presetKey, setPresetKey] = useState(0)

  // ── App mode ─────────────────────────────────────────────────────
  const [appMode, setAppMode] = useState('clinical')

  // ── Education-only state ─────────────────────────────────────────
  const [popupTrigger,   setPopupTrigger]   = useState(null)
  const [guidedOpen,     setGuidedOpen]     = useState(false)
  const [compareOpen,    setCompareOpen]    = useState(false)
  const [progressOpen,   setProgressOpen]  = useState(false)
  const [flashcardsOpen, setFlashcardsOpen] = useState(false)
  const [ecgQuizOpen,    setEcgQuizOpen]    = useState(false)
  const [casesOpen,      setCasesOpen]      = useState(false)
  const [unlocked,       setUnlocked]       = useState([])
  const [showLockToast,  setShowLockToast]  = useState(false)

  // ── Canvas refs ──────────────────────────────────────────────────
  const [labelState,  setLabelState]  = useState([])
  const [canvasReady, setCanvasReady] = useState(false)
  const [eduHeartOverride, setEduHeartOverride] = useState(null)
  const [openCards, setOpenCards] = useState({
    patient: false, params: false, metrics: false, viewmode: false,
    slice: false, filepicker: false, presets: false, edutools: false,
  })
  const heartGroupRef = useRef()
  const canvasWrapRef = useRef()

  // ── API data ─────────────────────────────────────────────────────
  // FIX 2: useHeartData takes NO arguments — it subscribes to the global
  // apiService subscriber bus. Passing `params` was a no-op and misleading.
  const { heartData } = useHeartData()

  // Start heart engine on mount
  useEffect(() => { startHeartEngine() }, [])

  // FIX 3: Fetch live metrics from backend on mount, fall back to static
  useEffect(() => {
    fetchMetrics().then(data => {
      if (data) {
        // Normalise backend metrics.json shape → internMetrics shape
        setLiveMetrics({
          ef:            data?.cardiac_function?.EF_pct    ?? baselineMetrics.ef,
          edv:           data?.cardiac_function?.EDV_mL    ?? baselineMetrics.edv,
          esv:           data?.cardiac_function?.ESV_mL    ?? baselineMetrics.esv,
          sv:            data?.cardiac_function?.SV_mL     ?? baselineMetrics.sv,
          efStatus:      data?.cardiac_function?.EF_status ?? baselineMetrics.efStatus,
          wallThickness: data?.wall_thickness_mm           ?? baselineMetrics.wallThickness,
          valveArea:     data?.valve_geometry?.annulus_area_mm2     ?? baselineMetrics.valveArea,
          semiMajor:     data?.valve_geometry?.semi_major_axis_mm   ?? baselineMetrics.semiMajor,
          semiMinor:     data?.valve_geometry?.semi_minor_axis_mm   ?? baselineMetrics.semiMinor,
        })
        console.log('✅ Live metrics loaded from GET /metrics')
      }
    }).catch(() => {
      console.warn('⚠️ GET /metrics failed — using bundled static metrics')
    })
  }, [])

  // FIX 5: Load region_map.json on mount for per-region heart deformation
  // Maps region keys (lv, rv, myo) to mesh names so DeformableHeart can
  // apply independent strain scaling per heart region.
  useEffect(() => {
    fetch('/patients/patient085/region_map.json')
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then(data => {
        if (data) {
          setRegionMap(data)
          console.log('✅ region_map.json loaded — per-region deformation enabled')
        } else {
          console.warn('⚠️ region_map.json not found — DeformableHeart will use uniform scale')
        }
      })
  }, [])

useEffect(() => {
  document.title =
    appMode === 'education'
      ? 'CardioTwin — Education Mode'
      : 'CardioTwin — View Mode'
}, [appMode])
  // Auto-dismiss lock toast
  useEffect(() => {
    if (!showLockToast) return
    const t = setTimeout(() => setShowLockToast(false), 2500)
    return () => clearTimeout(t)
  }, [showLockToast])

  const unlock = (id) =>
    setUnlocked(prev => prev.includes(id) ? prev : [...prev, id])

  const toggleCard = (key) => setOpenCards(prev => ({ ...prev, [key]: !prev[key] }))

  // ── Handlers ─────────────────────────────────────────────────────

  /**
   * FIX 1 — handleSlider
   * ─────────────────────
   * Previously this only called setParams() — the backend was never told
   * about slider changes.  Now we also call sendSliderParams() with the
   * updated Contractility, Afterload, and Infarct % values so the physics
   * engine responds in real time.
   *
   * Preload and Valve Area are frontend-only display parameters (the backend
   * physics model doesn't have a preload or valve-area knob in its current
   * implementation), so only the three backend-mapped sliders are forwarded.
   */
  const handleSlider = (label, value) => {
    const numValue = Number(value)
    setActivePreset(null)

    // Update local React state immediately (optimistic)
    setParams(prev => {
      const next = { ...prev, [label]: numValue }

      // FIX 1: send the three backend-mapped params after state update
      // We read from `next` (the updated state) so values are consistent
      const contractility = next['Contractility'] ?? 50
      const afterload     = next['Afterload']     ?? 50
      const infarctPct    = next['Infarct %']     ?? 0

      // Only POST if one of the three physics params changed
      if (['Contractility', 'Afterload', 'Infarct %'].includes(label)) {
        sendSliderParams(contractility, afterload, infarctPct)
      }

      return next
    })

    if (appMode === 'education') {
      setPopupTrigger({ label, value: numValue, ts: Date.now() })
      unlock('first_slider')
    }
  }

  /**
   * FIX 4 — handlePreset
   * ─────────────────────
   * sendPresetToEngine() now handles all subcategory labels via the
   * expanded presetMap in apiService.js.  Additionally we call
   * sendSliderParams() with the preset's own Contractility/Afterload/Infarct
   * values so the engine state is always in sync with UI display values
   * (important for sub-presets that don't exactly match a named backend preset).
   */
  const handlePreset = (values, label) => {
    const merged = {
      ...values,
      'Infarct %':  values['Infarct %']  ?? 0,
      'Valve Area': values['Valve Area'] ?? 100,
    }
    setParams(merged)
    setActivePreset(label)
    setPresetKey(k => k + 1)   // tells ECGGraph + PVLoop to flush and re-fetch

    // Send named preset to backend first (sets engine to closest preset)
    sendPresetToEngine(label)

    // Then fine-tune with exact slider values from the preset definition
    sendSliderParams(
      merged['Contractility'] ?? 50,
      merged['Afterload']     ?? 50,
      merged['Infarct %']     ?? 0,
    )

    if (appMode === 'education') {
      if (values.Contractility <= 20) unlock('heart_failure')
      if (values.Contractility >= 90) unlock('athlete')
      if ((values['Infarct %'] ?? 0) >= 70) unlock('mi')
    }
  }

  const handleApplyStep = (step) => { setParams(step.preset); setViewMode(step.viewMode) }

  const handleViewMode = (mode) => {
    setViewMode(mode)
    if (mode !== 'slice')   { setSliceMode(false); setSweeping(false) }
    if (mode !== 'chamber') setSelectedChamber(null)
    if (appMode === 'education') {
      if (mode === 'slice')  unlock('slice_master')
      if (mode === 'deform') unlock('strain_viewer')
    }
  }

  const handleSelectChamber = (id) => {
    setSelectedChamber(id)
    if (id && appMode === 'education') {
      const visited = [...(window._visitedChambers || []), id]
      window._visitedChambers = visited
      if (['LV','RV','LA','RA'].every(c => visited.includes(c))) unlock('chamber_explorer')
    }
  }

  const handleSliceMode = (val) => {
    setSliceMode(val)
    if (val) {
      setViewMode('slice')
    } else {
      setSliceY(3)
      setSweeping(false)
      setViewMode('full')
    }
  }

  const handleSelectPatient = (patient) => {
    setCurrentPatient(patient)
    if (patient.meshPath) {
      useGLTF.preload(patient.meshPath)
      setCustomModelURL(patient.meshPath)
    }
  }

  const activeParams    = eduHeartOverride ? eduHeartOverride.params : params
  const activeInfarct   = activeParams['Infarct %'] ?? 0
  const activeValve     = activeParams['Valve Area'] ?? 100

  // ── Derived metrics ──────────────────────────────────────────────
  // BUG FIX: use activeParams (which reflects edu overrides + presets)
  // instead of params. Previously ef/hr/edv/esv were derived from `params`
  // while PVLoop/ECGGraph received `activeParams` — causing the graphs to
  // show different values than the metric cards after preset changes.
  const infarct = activeInfarct   // alias for clarity below
  const valve   = activeValve

  // FIX 3: Prefer live backend metrics → patient-specific metrics → bundled static
  const patientMetrics = currentPatient?.metrics ?? liveMetrics ?? baselineMetrics

  const rawVolume   = heartData?.volume   != null ? parseFloat(heartData.volume)   : null
  const rawPressure = heartData?.pressure != null ? parseFloat(heartData.pressure) : null
  const rawECG      = heartData?.ecg      != null ? parseFloat(heartData.ecg)      : null
  const rawStrain   = heartData?.strain   != null ? parseFloat(heartData.strain)   : null
  const isLive      = rawVolume !== null

  // METRICS FIX: offline formulas now properly driven by preset param values.
  // Previously ef barely changed (patientMetrics.ef ± small delta).
  // Now Contractility=18 (DCM) gives EF~20%; Contractility=60 (Normal) gives EF~60%.
  const ef  = heartData?.ef
    ?? Math.round(Math.max(10, Math.min(85,
        (patientMetrics.ef * (activeParams.Contractility / 60)) * (1 - infarct * 0.008)
       )))
  const hr  = heartData?.hr  ?? Math.round(50 + activeParams.Preload * 0.5 + infarct * 0.25)
  const edv = heartData?.edv ?? Math.round(60 + activeParams.Preload * 1.2 + infarct * 0.4)
  const esv = heartData?.esv ?? Math.round(20 + activeParams.Afterload * 0.6 + infarct * 0.5)
  const beat      = useHeartbeat(hr)
  const handleBeat = useCallback(() => {}, [])

  const handleHeartSync = useCallback((heartParams, hView) => {
    setEduHeartOverride({ params: heartParams, viewMode: hView })
    setViewMode(hView ?? 'full')
  }, [])

  const closeAllEduTools = useCallback(() => {
    setFlashcardsOpen(false)
    setEcgQuizOpen(false)
    setCasesOpen(false)
    setGuidedOpen(false)
    setCompareOpen(false)
    setProgressOpen(false)
    setEduHeartOverride(null)
    setViewMode('full')
  }, [])

  const openEduTool = useCallback((tool) => {
    closeAllEduTools()
    if (tool === 'flashcards') setTimeout(() => setFlashcardsOpen(true), 0)
    if (tool === 'ecgquiz')    setTimeout(() => setEcgQuizOpen(true), 0)
    if (tool === 'cases')      setTimeout(() => setCasesOpen(true), 0)
    if (tool === 'guided')     setTimeout(() => setGuidedOpen(true), 0)
    if (tool === 'compare')    setTimeout(() => setCompareOpen(true), 0)
    if (tool === 'progress')   setTimeout(() => setProgressOpen(true), 0)
  }, [closeAllEduTools])

  // activeEf / activeHr alias ef / hr — both derived from activeParams above
  const activeEf        = ef
  const activeHr        = hr
  const activeBaseScale = 0.8 + (activeParams.Contractility / 100) * 0.6 * (1 - activeInfarct * 0.005)

  const isEducation = appMode === 'education'

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="app" data-mode={appMode}>

      {/* ── Header ── */}
      <header className="header">
        <div className="logo">
          <span className="logo-icon">🫀</span>
          CardioTwin-X
          <span className="logo-sub"></span>
        </div>

        <div className="header-right">
          <APIStatus />

          <div className="mode-toggle">
            <button
              className={`mode-toggle-btn ${!isEducation ? 'active' : ''}`}
              onClick={() => setAppMode('clinical')}
            >👁️ View Mode</button>
            <button
              className={`mode-toggle-btn ${isEducation ? 'active' : ''}`}
              onClick={() => setAppMode('education')}
            >📚 Education</button>
          </div>

          {isLive && (
            <div className="live-data-pill">
              ⚡ V:{rawVolume?.toFixed(1)} P:{rawPressure?.toFixed(0)}
            </div>
          )}

          {/* Show badge when live metrics are loaded from backend */}
          {liveMetrics && (
            <div className="live-data-pill" style={{ background: 'rgba(0,188,212,0.15)', color: '#00bcd4' }}>
              📊 Live Metrics
            </div>
          )}

         
        </div>
      </header>

      {/* ── Main ── */}
      <div className="main">

        {/* ── Left Panel (education only) ── */}
        <aside className="left-panel" style={{ display: isEducation ? undefined : 'none' }}>

          {isEducation && (
            <div className="edu-banner">
              <strong>📚 EDUCATION MODE</strong>
              Explore cardiac physiology interactively.
            </div>
          )}

          {/* ── Accordion: Education Tools ── */}
          {isEducation && (
            <div className={`card accordion-card ${openCards.edutools ? 'acc-open' : ''}`}>
              <button className="acc-header" onClick={() => toggleCard('edutools')}>
                <span>🎓 Learning Tools</span>
                <span className="acc-chevron">{openCards.edutools ? '▲' : '▼'}</span>
              </button>
              {openCards.edutools && (
                <div className="acc-body">
                  <div className="edu-tools-grid">
                    <button className="edu-tool-btn edu-tool-primary" onClick={() => openEduTool('guided')}>
                      <span className="edu-tool-icon">📚</span>
                      <span className="edu-tool-label">Guided Tour</span>
                    </button>
                    <button className="edu-tool-btn" onClick={() => openEduTool('flashcards')}>
                      <span className="edu-tool-icon">🃏</span>
                      <span className="edu-tool-label">Flashcards</span>
                    </button>
                    <button className="edu-tool-btn" onClick={() => openEduTool('ecgquiz')}>
                      <span className="edu-tool-icon">⚡</span>
                      <span className="edu-tool-label">ECG Quiz</span>
                    </button>
                    <button className="edu-tool-btn" onClick={() => openEduTool('cases')}>
                      <span className="edu-tool-icon">🏥</span>
                      <span className="edu-tool-label">Cases</span>
                    </button>
                    <button className="edu-tool-btn" onClick={() => openEduTool('compare')}>
                      <span className="edu-tool-icon">⚖️</span>
                      <span className="edu-tool-label">Compare</span>
                    </button>
                    <button className="edu-tool-btn edu-tool-achievement" onClick={() => openEduTool('progress')}>
                      <span className="edu-tool-icon">🏆</span>
                      <span className="edu-tool-label">Achievements <span className="edu-badge">{unlocked.length}/8</span></span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Accordion: Patient ── */}
          <div className={`card accordion-card ${openCards.patient ? 'acc-open' : ''}`}>
            <button className="acc-header" onClick={() => toggleCard('patient')}>
              <span>👤 Patient</span>
              <span className="acc-chevron">{openCards.patient ? '▲' : '▼'}</span>
            </button>
            {openCards.patient && (
              <div className="acc-body">
                <PatientSelector
                  onSelectPatient={handleSelectPatient}
                  currentPatient={currentPatient}
                />
              </div>
            )}
          </div>

          {/* ── Accordion: Parameters ── */}
          <div className={`card accordion-card ${openCards.params ? 'acc-open' : ''}`}>
            <button className="acc-header" onClick={() => toggleCard('params')}>
              <span>⚙️ Parameters</span>
              <span className="acc-chevron">{openCards.params ? '▲' : '▼'}</span>
            </button>
            {openCards.params && (
              <div className="acc-body">
                {SLIDERS.map(({ label, color }) => (
                  <div className="slider-row" key={label}>
                    <div className="slider-label">
                      <span>{label}</span>
                      <span style={{ color }}>{params[label] ?? 0}</span>
                    </div>
                    <input
                      type="range" min="0" max="100"
                      value={params[label] ?? 0}
                      onChange={e => handleSlider(label, e.target.value)}
                      style={{ accentColor: color }}
                    />
                  </div>
                ))}
                {/* FIX 1: Inform user that sliders now affect the backend */}
                <div style={{
                  marginTop: '8px', fontSize: '10px',
                  color: '#666', borderTop: '1px solid #1a1a2e', paddingTop: '6px',
                }}>
                  ⚡ Contractility, Afterload & Infarct % stream to physics engine
                </div>
              </div>
            )}
          </div>

          {/* ── Accordion: Metrics ── */}
          <div className={`card accordion-card ${openCards.metrics ? 'acc-open' : ''}`}>
            <button className="acc-header" onClick={() => toggleCard('metrics')}>
              <span>
                📊 Metrics
                {isLive && <span className="card-live-dot">● LIVE</span>}
                {liveMetrics && !isLive && <span className="card-live-dot" style={{ color: '#00bcd4' }}>● API</span>}
              </span>
              <span className="acc-chevron">{openCards.metrics ? '▲' : '▼'}</span>
            </button>
            {openCards.metrics && (
              <div className="acc-body">
                {[
                  { label: '🫀 EF',            value: `${activeEf}%`,       color: activeEf >= 55 ? '#ab47bc' : activeEf >= 40 ? '#ff9800' : '#ef5350' },
                  { label: '💓 Heart Rate',     value: `${activeHr} bpm`,    color: '#00bcd4' },
                  { label: '🩸 Cardiac Output', value: `${((activeEf / 100) * activeHr * 0.08 * (activeValve / 100)).toFixed(1)} L/min`, color: '#ab47bc' },
                  { label: '📦 EDV',            value: `${edv} ml`, color: '#00bcd4' },
                  { label: '📦 ESV',            value: `${esv} ml`, color: '#00bcd4' },
                  { label: '🔴 Infarct',        value: `${activeInfarct}%`,  color: activeInfarct > 30 ? '#ef5350' : activeInfarct > 10 ? '#ff9800' : '#ab47bc' },
                  { label: '🫁 Valve Area',     value: `${activeValve}%`,    color: activeValve < 50 ? '#ef5350' : activeValve < 75 ? '#ff9800' : '#ab47bc' },
                  { label: '🩺 SBP',            value: `${Math.round((60 + activeParams.Afterload * 0.9) * (activeValve / 100))} mmHg`, color: '#00bcd4' },
                  { label: '🩺 DBP',            value: `${Math.round(60 + activeParams.Preload * 0.2)} mmHg`, color: '#00bcd4' },
                  { label: '📏 Wall',           value: `${patientMetrics.wallThickness} mm`, color: '#ab47bc' },
                ].map(({ label, value, color }) => (
                  <div className="vital-row" key={label}>
                    <span className="vital-label">{label}</span>
                    <span className="vital-value" style={{ color }}>{value}</span>
                  </div>
                ))}
                {isLive && (
                  <div className="live-section">
                    <div className="live-section-title">⚡ LIVE BACKEND</div>
                    {[
                      { label: '📈 Volume',   value: `${rawVolume?.toFixed(2)} ml`    },
                      { label: '💨 Pressure', value: `${rawPressure?.toFixed(2)} mmHg` },
                      { label: '⚡ ECG',      value: rawECG?.toFixed(4)               },
                      { label: '📐 Strain',   value: typeof rawStrain === 'object'
                          ? `LV: ${rawStrain?.LV ?? rawStrain?.global}`
                          : rawStrain?.toFixed(4) },
                    ].map(({ label, value }) => (
                      <div className="vital-row" key={label}>
                        <span className="vital-label">{label}</span>
                        <span className="live-value">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Accordion: View Mode ── */}
          <div className={`card accordion-card ${openCards.viewmode ? 'acc-open' : ''}`}>
            <button className="acc-header" onClick={() => toggleCard('viewmode')}>
              <span>🔬 View Mode</span>
              <span className="acc-chevron">{openCards.viewmode ? '▲' : '▼'}</span>
            </button>
            {openCards.viewmode && (
              <div className="acc-body">
                <div className="view-grid">
                  {VIEW_MODES.map(btn => {
                    const locked = btn.eduOnly && !isEducation
                    return (
                      <button
                        key={btn.id}
                        className={`view-btn ${viewMode === btn.id ? 'active' : ''}`}
                        onClick={() => locked ? setShowLockToast(true) : handleViewMode(btn.id)}
                        title={locked ? '🔒 Education Mode only' : btn.desc}
                        style={locked ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                      >
                        {locked ? '🔒 ' : ''}{btn.label}
                      </button>
                    )
                  })}
                </div>
                {viewMode !== 'full' && (
                  <div className="view-mode-desc">
                    ● {VIEW_MODES.find(v => v.id === viewMode)?.desc}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Accordion: Slice Controls ── */}
          {(viewMode === 'slice' || viewMode === 'chamber') && (
            <div className={`card accordion-card ${openCards.slice ? 'acc-open' : ''}`}>
              <button className="acc-header" onClick={() => toggleCard('slice')}>
                <span>✂️ Slice Controls</span>
                <span className="acc-chevron">{openCards.slice ? '▲' : '▼'}</span>
              </button>
              {openCards.slice && (
                <div className="acc-body">
                  <SliceControls
                    sliceY={sliceY}       setSliceY={setSliceY}
                    sliceAxis={sliceAxis} setSliceAxis={setSliceAxis}
                    sliceMode={sliceMode} setSliceMode={handleSliceMode}
                    sweeping={sweeping}   setSweeping={setSweeping}
                    sweepSpeed={sweepSpeed} setSweepSpeed={setSweepSpeed}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Accordion: Disease Presets ── */}
          <div className={`card accordion-card ${openCards.presets ? 'acc-open' : ''}`}>
            <button className="acc-header" onClick={() => toggleCard('presets')}>
              <span>🧬 Disease Presets</span>
              <span className="acc-chevron">{openCards.presets ? '▲' : '▼'}</span>
            </button>
            {openCards.presets && (
              <div className="acc-body">
                <DiseasePresets onSelect={handlePreset} active={activePreset} />
              </div>
            )}
          </div>

        </aside>

        {/* ── Center Canvas ── */}
        <div className="canvas-container">
          <div className="canvas-header">
            <span className="canvas-title">
              {viewMode === 'full'    && '🫀 3D Heart Viewer — Patient Specific Mesh'}
              {viewMode === 'chamber' && '🔬 Chamber View'}
              {viewMode === 'slice'   && '✂️ Slice View'}
              {viewMode === 'deform'  && '🧬 Strain View'}
            </span>
            <div className="canvas-badges">
              {isEducation    && <span className="canvas-badge">Education Mode</span>}
              {isLive         && <span className="canvas-badge canvas-badge-live">⚡ Live Backend</span>}
              {currentPatient && <span className="canvas-badge canvas-badge-patient">👤 {currentPatient.label}</span>}
            </div>
          </div>

          <div className="canvas-wrap" ref={canvasWrapRef}>
            <div className="canvas-bg-nebula" />
            <div className="canvas-bg-vignette" />
            <div className="canvas-bg-scanlines" />
            <div className="canvas-hud-tl" />
            <div className="canvas-hud-tr" />
            <div className="canvas-hud-bl" />
            <div className="canvas-hud-br" />

            <Canvas
              camera={{ position: [0, 0, 4] }}
              gl={{ localClippingEnabled: true }}
              onCreated={() => setTimeout(() => setCanvasReady(true), 200)}
            >
              <ambientLight intensity={1} />
              <pointLight position={[10, 10, 10]} intensity={1.5} />
              <pointLight position={[-10, -10, -10]} intensity={0.8} />
              <spotLight position={[0, 10, 0]} intensity={1} />

              {viewMode === 'full' && (
                <>
                  <HeartModel
                    baseScale={activeBaseScale} heartRate={activeHr}
                    onBeat={handleBeat}
                    customURL={customModelURL}
                    heartGroupRef={heartGroupRef}
                  />
                  <HeartLabels3D
                    onProjected={setLabelState}
                    heartGroupRef={heartGroupRef}
                  />
                </>
              )}
              {viewMode === 'chamber' && (
                <ChamberHeart
                  baseScale={activeBaseScale} heartRate={activeHr}
                  onSelectChamber={handleSelectChamber}
                  selectedChamber={selectedChamber}
                  sliceY={sliceY} sliceAxis={sliceAxis}
                  showSlice={sliceMode} infarct={activeInfarct}
                />
              )}
              {viewMode === 'slice' && (
                <SlicedHeart
                  baseScale={activeBaseScale} heartRate={activeHr}
                  sliceY={sliceY} sliceAxis={sliceAxis}
                  sweeping={sweeping} sweepSpeed={sweepSpeed}
                  customURL={customModelURL}
                />
              )}
              {viewMode === 'deform' && (
                <DeformableHeart
                  baseScale={activeBaseScale} heartRate={activeHr}
                  infarct={activeInfarct} customURL={customModelURL}
                  strainRegions={heartData?.strainRegions ?? null}
                  regionMap={regionMap}
                />
              )}
              <OrbitControls enableZoom enablePan />
            </Canvas>

            {/* HTML overlays */}
            {viewMode === 'full' && (
              <HeartLabelsHTML
                labels={labelState}
                canvasRef={canvasWrapRef}
                selectedChamber={selectedChamber}
                onSelectChamber={handleSelectChamber}
                ef={activeEf} edv={edv} esv={esv}
                contractility={activeParams.Contractility}
              />
            )}
            {(viewMode === 'deform' || viewMode === 'chamber') && (
              <HeatmapLegend infarct={infarct} />
            )}
          </div>
        </div>

        {/* ── Right Panel ── */}
        <aside className="right-panel">
          {canvasReady ? (
            <>
              <div className="card">
                <ECGGraph
                  heartRate={activeHr} beat={beat}
                  ef={activeEf} infarct={activeInfarct}
                  mockOverride={!!eduHeartOverride}
                  presetKey={presetKey}
                />
              </div>
              <div className="card">
                <PVLoop
                  preload={activeParams.Preload} afterload={activeParams.Afterload}
                  heartRate={activeHr} beat={beat}
                  infarct={activeInfarct} valve={activeValve} ef={activeEf}
                  mockOverride={!!eduHeartOverride}
                  presetKey={presetKey}
                />
              </div>
              <div className="card">
                <StrainPanel infarct={activeInfarct} />
              </div>
            </>
          ) : (
            <div className="canvas-loading">Loading graphs…</div>
          )}
        </aside>

      </div>

      {/* ── Education-only overlays ── */}
      {isEducation && (
        <>
          <LearningCard selected={selectedChamber} onClose={() => setSelectedChamber(null)} />
          {guidedOpen && (
            <GuidedLearning
              onClose={() => { closeAllEduTools(); unlock('guided_complete') }}
              onApplyStep={handleApplyStep}
            />
          )}
          {compareOpen    && <ComparePanel    onClose={closeAllEduTools} />}
          {progressOpen   && <ProgressTracker unlocked={unlocked} onClose={closeAllEduTools} />}
          {flashcardsOpen && <FlashcardDeck
            onClose={closeAllEduTools}
            onCardChange={handleHeartSync}
          />}
          {ecgQuizOpen    && <ECGQuiz         onClose={closeAllEduTools} onHeartSync={handleHeartSync} />}
          {casesOpen      && <ClinicalCases   onClose={closeAllEduTools} onHeartSync={handleHeartSync} />}
          <CauseEffectPopup trigger={popupTrigger} />
        </>
      )}

      {/* ── Lock toast ── */}
      {showLockToast && (
        <div className="lock-toast">
          🔒 Switch to <span className="lock-toast-accent">📚 Education Mode</span> to unlock this view
        </div>
      )}

    </div>
  )
}