/**
 * CardiacCycleLab.jsx — PUC: interactive phase breakdown
 * ───────────────────────────────────────────────────────
 * The Wiggers-style phases:
 *   1 Joint Diastole            0.54–1.00 + 0.00–0.14
 *   2 Atrial Systole            0.00–0.14
 *   3 Isovolumetric Contraction 0.14–0.20
 *   4 Ventricular Ejection      0.20–0.46 (+ iso relaxation 0.46–0.54)
 *
 * Selecting a phase FREEZES the master engine at its midpoint (or you can
 * scrub continuously with the slider) — the 3-D heart, PV-loop cursor and
 * ECG all hold the exact matching instant.
 */

import { useEffect, useState } from 'react'
import { freezeAtPhase, setEngineSpeed } from '../../../simulation/cardiacEngine'

const PHASES = [
  {
    id: 'joint',
    name: 'Joint Diastole',
    range: [0.62, 0.98],
    mid: 0.80,
    color: '#10B981',
    what: 'ALL four chambers relaxed. AV valves (mitral, tricuspid) open; semilunar valves shut. Ventricles passively fill — first rapidly (E-wave), then slowly (diastasis).',
    pressures: 'Aorta ≈ 80 · Ventricle ≈ 5-10 · Atria ≈ 2-8 mmHg',
  },
  {
    id: 'atrial',
    name: 'Atrial Systole (P wave)',
    range: [0.00, 0.14],
    mid: 0.07,
    color: '#FF2E93',
    what: 'Atria contract — the "atrial kick" tops up the ventricles with the last ~25% of filling. The P wave on ECG marks this.',
    pressures: 'Atrial pressure briefly exceeds ventricular → AV valves stay open',
  },
  {
    id: 'isovol',
    name: 'Isovolumetric Contraction (QRS)',
    range: [0.14, 0.20],
    mid: 0.17,
    color: '#00F2FE',
    what: 'Ventricles contract with ALL valves closed — volume cannot change, so PRESSURE rockets. First heart sound ("lub") = AV valves snapping shut.',
    pressures: 'LV pressure jumps ~10 → 80 mmHg at constant volume (vertical PV line)',
  },
  {
    id: 'eject',
    name: 'Ventricular Ejection',
    range: [0.20, 0.50],
    mid: 0.33,
    color: '#F59E0B',
    what: 'LV pressure beats aortic pressure → aortic valve opens → stroke volume (~70 mL) is ejected. T wave ends systole; semilunar valves close ("dup") then isovolumetric relaxation drops pressure back.',
    pressures: 'Aortic peaks ≈ 120 mmHg; LV volume 120 → 50 mL',
  },
]

export default function CardiacCycleLab({ onHeartSync }) {
  const [sel, setSel]       = useState(null)
  const [scrub, setScrub]   = useState(false)
  const [phase, setPhase]   = useState(0.33)

  // slow-motion while the lab is mounted
  useEffect(() => { setEngineSpeed(0.35); return () => setEngineSpeed(1) }, [])

  useEffect(() => {
    if (!scrub) freezeAtPhase(sel ? PHASES[sel].mid : null)
    return () => freezeAtPhase(null)
  }, [sel, scrub])

  useEffect(() => {
    if (scrub) freezeAtPhase(phase)
  }, [scrub, phase])

  const choose = i => {
    setSel(cur => cur === i ? null : i)
    setScrub(false)
  }

  return (
    <div className="cycle-lab">
      <div className="cycle-phases">
        {PHASES.map((p, i) => (
          <button
            key={p.id}
            className={`cycle-phase ${sel === i ? 'active' : ''}`}
            style={{ '--pc': p.color }}
            onClick={() => choose(i)}
          >
            <span className="cycle-num">{i + 1}</span>
            <span>{p.name}</span>
          </button>
        ))}
      </div>

      {sel !== null && !scrub && (
        <div className="cycle-detail" style={{ borderLeftColor: PHASES[sel].color }}>
          <strong>{PHASES[sel].name}</strong>
          <p>{PHASES[sel].what}</p>
          <p className="cycle-pressures">{PHASES[sel].pressures}</p>
        </div>
      )}

      <label className="slider-label" style={{ marginTop: 8 }}>
        <span>🔬 Free scrub (freeze &amp; drag the whole heart)</span>
        <button
          className={`mini-toggle ${scrub ? 'on' : ''}`}
          onClick={() => { if (!scrub && sel !== null) setSel(null); setScrub(s => !s) }}
        >
          {scrub ? 'ON' : 'OFF'}
        </button>
      </label>
      <input
        className="glass-range"
        type="range" min="0" max="0.99" step="0.01"
        value={scrub ? phase : (sel !== null ? PHASES[sel].mid : 0.33)}
        disabled={!scrub}
        onChange={e => setPhase(Number(e.target.value))}
        style={{ '--fill': `${(scrub ? phase : 0.33) * 100}%` }}
      />
      <p className="cycle-hint">
        {scrub
          ? `Frozen at ${(100 * phase).toFixed(0)}% of the cardiac cycle`
          : sel !== null ? 'Heart frozen at this exact instant' : 'Pick a phase above — or enable free scrub'}
      </p>
    </div>
  )
}
