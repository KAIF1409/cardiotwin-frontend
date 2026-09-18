/**
 * ControlDock.jsx — left panel: collapsible accordion sections
 * ─────────────────────────────────────────────────────────────
 * Patient (PatientSelector)
 * Hemodynamics (5 custom sliders — always available in BOTH modes)
 * Disease Presets(DiseasePresets cards)
 * Interventions (Higher mode only — advanced pharmacology)
 * Lessons (Higher mode — advanced learning modules)
 * Slice / MRI (SliceControls)
 */

import { useState } from 'react'
import { User, Sliders, Heart, Pill, BookOpen, Scissors, ChevronLeft } from 'lucide-react'
import PatientSelector from '../PatientSelector'
import DiseasePresets from '../DiseasePresets'
import SliceControls from '../SliceControls'
import ClinicalInterventions from '../ClinicalInterventions'
import NcertLessonPanel from '../ncert/NcertLessonPanel'

const PARAM_META = [
  {
    key: 'Preload',
    icon: User,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    tip: 'Filling volume of the ventricle (Frank–Starling)'
  },
  {
    key: 'Afterload',
    icon: Sliders,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    tip: 'Resistance the heart pumps against'
  },
  {
    key: 'Contractility',
    icon: Heart,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    tip: 'Intrinsic strength of contraction'
  },
  {
    key: 'Infarct %',
    icon: Heart,
    min: 0,
    max: 100,
    step: 5,
    unit: '%',
    tip: 'Fraction of dead myocardium after MI'
  },
  {
    key: 'Valve Area',
    icon: Sliders,
    min: 40,
    max: 130,
    step: 5,
    unit: '%',
    tip: 'Aortic valve opening relative to normal'
  }
]

function Accordion({ id, icon: Icon, title, badge, open, onToggle, children }) {
  return (
    <section className={`dock-section ${open ? 'open' : ''}`}>
      <button
        className="dock-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`sec-${id}`}
      >
        <Icon size={14} className="dock-head-icon" strokeWidth={1.5} />
        <span className="dock-head-title">{title}</span>
        {badge != null && <span className="dock-head-badge">{badge}</span>}
        <span className="dock-chev" aria-hidden></span>
      </button>
      <div className="dock-body" id={`sec-${id}`} hidden={!open}>
        {children}
      </div>
    </section>
  )
}

export default function ControlDock({
  params,
  onSlider,
  heartRate,
  setHeartRate,
  activePresetLabel,
  onPreset,
  onSelectPatient,
  currentPatient,
  onDose,
  activeMed,
  onRevert,
  ncertOn = false,
  medsOn = false,
  onHeartSync,
  slice, // {sliceY,setSliceY,sliceAxis,setSliceAxis,sliceMode,setSliceMode,sweeping,setSweeping,sweepSpeed,setSweepSpeed}
  collapsed = false,
  onToggleCollapse
}) {
  const [open, setOpen] = useState({
    patient: true,
    hemo: true,
    presets: true,
    meds: false,
    ncert: false,
    slice: false
  })
  const toggle = k => setOpen(o => ({ ...o, [k]: !o[k] }))

  return (
    <aside className={`control-dock ${collapsed ? 'slid' : ''}`}>
      {/* Drawer handle strip — slides the whole dock off-screen */}
      <div className="panel-strip">
        <span className="panel-strip-label">CONTROLS</span>
        <button
          className="strip-btn"
          onClick={onToggleCollapse}
          title="Slide panel away (fullscreen canvas)"
          aria-label="Collapse control dock"
        >
          <ChevronLeft size={12} strokeWidth={2.2} />
        </button>
      </div>
      <div className="dock-inner">
        <div className="dock-scroll">
          <Accordion
            id="patient"
            icon={User}
            title="Patient"
            open={open.patient}
            onToggle={() => toggle('patient')}
          >
            <PatientSelector onSelectPatient={onSelectPatient} currentPatient={currentPatient} />
            <div className="slider-row" style={{ marginTop: 10 }}>
              <label className="slider-label" htmlFor="hr-slider">
                <span title="Beats per minute — drives every animation">
                  <Heart size={12} className="inline-icon" />
                  Heart Rate
                </span>
                <span className="slider-value">
                  {heartRate}
                  <small> bpm</small>
                </span>
              </label>
              <input
                id="hr-slider"
                className="glass-range"
                type="range"
                min="40"
                max="180"
                step="1"
                value={heartRate}
                onChange={e => setHeartRate(Number(e.target.value))}
                style={{ '--fill': `${((heartRate - 40) / 140) * 100}%` }}
              />
            </div>
          </Accordion>
          <Accordion
            id="hemo"
            icon={Sliders}
            title="Hemodynamics"
            open={open.hemo}
            onToggle={() => toggle('hemo')}
            badge={activePresetLabel ? undefined : 'custom'}
          >
            <p className="dock-hint" style={{ marginTop: 0 }}>
              Every slider rescales the mesh, ECG sweep, PV loop & strain together.
            </p>
            {PARAM_META.map(({ key, icon: Icon, min, max, step, unit, tip }) => (
              <div className="slider-row" key={key}>
                <label className="slider-label" htmlFor={`sl-${key}`}>
                  <span title={tip}>
                    <Icon size={12} className="inline-icon" /> {key.replace('%', '')}
                  </span>
                  <span className="slider-value">
                    {params[key] ?? 50}
                    <small>{unit}</small>
                  </span>
                </label>
                <input
                  id={`sl-${key}`}
                  className="glass-range"
                  data-param={key}
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={params[key] ?? 50}
                  onChange={e => onSlider(key, Number(e.target.value))}
                  style={{ '--fill': `${(((params[key] ?? 50) - min) / (max - min)) * 100}%` }}
                />
              </div>
            ))}
          </Accordion>
          <Accordion
            id="presets"
            icon={Heart}
            title="Disease Presets"
            open={open.presets}
            onToggle={() => toggle('presets')}
          >
            <DiseasePresets onSelect={onPreset} active={activePresetLabel} />
          </Accordion>
          <Accordion
            id="meds"
            icon={Pill}
            title="Clinical Interventions"
            open={open.meds}
            onToggle={() => toggle('meds')}
            badge={activeMed ? 'dosed' : undefined}
          >
            {medsOn ? (
              <ClinicalInterventions onDose={onDose} activeMed={activeMed} onRevert={onRevert} />
            ) : (
              <p className="dock-hint">
                Advanced pharmacology unlocks in<b>Higher Mode</b>.
              </p>
            )}
          </Accordion>

          {ncertOn && (
            <Accordion
              id="ncert"
              icon={BookOpen}
              title="Lessons"
              open={open.ncert}
              onToggle={() => toggle('ncert')}
              badge="NEW"
            >
              <NcertLessonPanel onHeartSync={onHeartSync} />
            </Accordion>
          )}

          <Accordion
            id="slice"
            icon={Scissors}
            title="Slice / MRI Sweep"
            open={open.slice}
            onToggle={() => toggle('slice')}
          >
            <SliceControls {...slice} />
          </Accordion>
        </div>
      </div>
    </aside>
  )
}
