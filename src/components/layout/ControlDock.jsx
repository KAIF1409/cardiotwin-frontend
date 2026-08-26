/**
 * ControlDock.jsx — left panel: collapsible accordion sections
 * ─────────────────────────────────────────────────────────────
 *  ▸ Patient        (PatientSelector)
 *  ▸ Hemodynamics   (5 custom sliders — always available in BOTH modes;
 *                     v1 hid this entire dock in clinical mode!)
 *  ▸ Disease Presets(DiseasePresets cards)
 *  ▸ Slice / MRI    (SliceControls)
 */

import { useState } from 'react'
import PatientSelector from '../PatientSelector'
import DiseasePresets from '../DiseasePresets'
import SliceControls from '../SliceControls'

const PARAM_META = [
  { key: 'Preload',        icon: '📦', min: 0,  max: 100, step: 1, unit: '%', tip: 'Filling volume of the ventricle (Frank–Starling)' },
  { key: 'Afterload',      icon: '💨', min: 0,  max: 100, step: 1, unit: '%', tip: 'Resistance the heart pumps against' },
  { key: 'Contractility',  icon: '💪', min: 0,  max: 100, step: 1, unit: '%', tip: 'Intrinsic strength of contraction' },
  { key: 'Infarct %',      icon: '🔴', min: 0,  max: 100, step: 5, unit: '%', tip: 'Fraction of dead myocardium after MI' },
  { key: 'Valve Area',     icon: '🚪', min: 40, max: 130, step: 5, unit: '%', tip: 'Aortic valve opening relative to normal' },
]

function Accordion({ id, icon, title, badge, open, onToggle, children }) {
  return (
    <section className={`dock-section ${open ? 'open' : ''}`}>
      <button className="dock-head" onClick={onToggle} aria-expanded={open} aria-controls={`sec-${id}`}>
        <span className="dock-head-icon">{icon}</span>
        <span className="dock-head-title">{title}</span>
        {badge != null && <span className="dock-head-badge">{badge}</span>}
        <span className="dock-chev" aria-hidden>▾</span>
      </button>
      <div className="dock-body" id={`sec-${id}`} hidden={!open}>
        {children}
      </div>
    </section>
  )
}

export default function ControlDock({
  params, onSlider,
  heartRate, setHeartRate,
  activePresetLabel, onPreset,
  onSelectPatient, currentPatient,
  slice, // {sliceY,setSliceY,sliceAxis,setSliceAxis,sliceMode,setSliceMode,sweeping,setSweeping,sweepSpeed,setSweepSpeed}
}) {
  const [open, setOpen] = useState({ patient: true, hemo: true, presets: true, slice: false })
  const toggle = k => setOpen(o => ({ ...o, [k]: !o[k] }))

  return (
    <aside className="control-dock">
      <div className="dock-scroll">
        <Accordion id="patient" icon="👤" title="Patient" open={open.patient} onToggle={() => toggle('patient')}>
          <PatientSelector onSelectPatient={onSelectPatient} currentPatient={currentPatient} />
          <div className="slider-row" style={{ marginTop: 10 }}>
            <label className="slider-label" htmlFor="hr-slider">
              <span title="Beats per minute — drives every animation">❤️ Heart Rate</span>
              <span className="slider-value">{heartRate}<small> bpm</small></span>
            </label>
            <input
              id="hr-slider"
              className="glass-range"
              type="range" min="40" max="180" step="1"
              value={heartRate}
              onChange={e => setHeartRate(Number(e.target.value))}
              style={{ '--fill': `${((heartRate - 40) / 140) * 100}%` }}
            />
          </div>
        </Accordion>

        <Accordion id="hemo" icon="🎚️" title="Hemodynamics" open={open.hemo} onToggle={() => toggle('hemo')}
          badge={activePresetLabel ? undefined : 'custom'}>
          <p className="dock-hint" style={{ marginTop: 0 }}>
            Every slider rescales the mesh, ECG sweep, PV loop & strain together.
          </p>
          {PARAM_META.map(({ key, icon, min, max, step, unit, tip }) => (
            <div className="slider-row" key={key}>
              <label className="slider-label" htmlFor={`sl-${key}`}>
                <span title={tip}>{icon} {key.replace(' %', '')}</span>
                <span className="slider-value">{params[key] ?? 50}<small>{unit}</small></span>
              </label>
              <input
                id={`sl-${key}`}
                className="glass-range"
                data-param={key}
                type="range" min={min} max={max} step={step}
                value={params[key] ?? 50}
                onChange={e => onSlider(key, Number(e.target.value))}
                style={{ '--fill': `${(((params[key] ?? 50) - min) / (max - min)) * 100}%` }}
              />
            </div>
          ))}
        </Accordion>

        <Accordion id="presets" icon="🫀" title="Disease Presets" open={open.presets} onToggle={() => toggle('presets')}>
          <DiseasePresets onSelect={onPreset} active={activePresetLabel} />
        </Accordion>

        <Accordion id="slice" icon="✂️" title="Slice / MRI Sweep" open={open.slice} onToggle={() => toggle('slice')}>
          <SliceControls {...slice} />
        </Accordion>
      </div>
    </aside>
  )
}
