/**
 * ClinicalInterventions.jsx — bedside pharmacology simulator
 * ═══════════════════════════════════════════════════════════
 * One-tap medications that reshape the LIVE hemodynamic sliders
 * (preload · afterload · contractility · heart rate), teaching:
 *
 * • Inotropes — Epinephrine, Dobutamine (↑ contractility, ↑ HR)
 * • Chronnegative — Beta-Blocker (↓ HR, ↓ contractility)
 * • Venodilators — Nitroglycerin, Furosemide (↓ preload — angina relief)
 * • Arteriodilator — ACE-Inhibitor (↓ afterload)
 *
 * Every dose is applied as a Δ on the CURRENT patient state (clamped to the
 * slider ranges) and pushes to the backend telemetry like a manual slider —
 * ECG, PV loop, strain, 3-D mesh and blood flow all respond together.
 * A snapshot chip allows one-tap REVERT (teaches drug half-life intuition).
 */

import { Zap, TrendingUp, Gauge, Droplet, Wind, Waves } from 'lucide-react'

const MEDS = [
  {
    id: 'epi',
    Icon: Zap,
    name: 'Epinephrine',
    cls: 'sympathomimetic',
    desc: '↑↑ Contractility & ↑ HR — anaphylaxis / arrest. Watch arrhythmia risk at high dose.',
    fx: { Contractility: +18 },
    hr: +15
  },
  {
    id: 'dobu',
    Icon: TrendingUp,
    name: 'Dobutamine',
    cls: 'inotrope',
    desc: 'β1 agonist — ↑ contractility without much tachycardia. Cardiogenic shock workhorse.',
    fx: { Contractility: +22 },
    hr: +6
  },
  {
    id: 'bb',
    Icon: Gauge,
    name: 'Beta-Blocker',
    cls: 'chronnegative',
    desc: '↓ HR & ↓ contractility — rate control in AF, angina, HCM. Caution in acute HF.',
    fx: { Contractility: -14 },
    hr: -18
  },
  {
    id: 'ntg',
    Icon: Droplet,
    name: 'Nitroglycerin',
    cls: 'venodilator',
    desc: '↓ Preload via venodilation — first-line for angina & acute pulmonary oedema.',
    fx: { Preload: -20 }
  },
  {
    id: 'ace',
    Icon: Wind,
    name: 'ACE-Inhibitor',
    cls: 'arteriodilator',
    desc: '↓ Afterload — afterload reduction ↑ stroke volume in HFrEF, protects the kidneys.',
    fx: { Afterload: -18 }
  },
  {
    id: 'furo',
    Icon: Waves,
    name: 'Furosemide',
    cls: 'diuretic',
    desc: 'Loop diuretic — dumps volume, ↓ preload. Listen: S3 gallop fades as congestion clears.',
    fx: { Preload: -26 }
  }
]

export default function ClinicalInterventions({ onDose, activeMed, onRevert }) {
  return (
    <div className="ci">
      <p className="dock-hint ci-hint">
        Each drug nudges the live sliders — watch ECG, PV loop & the 3-D heart react together.
      </p>
      <div className="ci-grid">
        {MEDS.map(m => (
          <button
            key={m.id}
            className={`ci-med ${activeMed === m.id ? 'active' : ''}`}
            onClick={() => onDose(m)}
            title={`${m.name} — ${m.cls}`}
          >
            <span className="ci-ico" aria-hidden>
              <m.Icon size={15} strokeWidth={1.75} />
            </span>
            <span className="ci-name">{m.name}</span>
            <small className="ci-cls">{m.cls}</small>
          </button>
        ))}
      </div>

      {activeMed && (
        <button className="ci-revert" onClick={onRevert}>
          Revert “{activeMed}”
        </button>
      )}

      <p className="ci-foot">Educational dosing only — not a prescribing reference.</p>
    </div>
  )
}

export { MEDS }
