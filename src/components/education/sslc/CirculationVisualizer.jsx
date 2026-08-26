/**
 * CirculationVisualizer.jsx — SSLC: double circulation concept
 * ─────────────────────────────────────────────────────────────
 * Toggle which circuit the blood-particle system emphasises:
 *   BOTH · PULMONARY (right heart ⇄ lungs) · SYSTEMIC (left heart ⇄ body)
 * Drives engine.setCirculationMode → particles dim/boost instantly.
 */

import { useEffect, useState } from 'react'
import { setCirculationMode } from '../../../simulation/cardiacEngine'

const MODES = [
  {
    id: 'both',
    icon: '🔁',
    name: 'Double Circulation',
    text: 'Blood passes through the heart TWICE per full body loop: right side → lungs (pulmonary), left side → body (systemic). Both circuits run together.',
  },
  {
    id: 'pulmonary',
    icon: '🫁',
    name: 'Pulmonary Circuit',
    text: 'Right ventricle pumps deoxygenated blood through the pulmonary artery to the lungs. Oxygen is picked up, CO₂ released. Watch the BLUE stream.',
  },
  {
    id: 'systemic',
    icon: '🦶',
    name: 'Systemic Circuit',
    text: 'Left ventricle pumps oxygenated blood through the aorta to every organ. Watch the CYAN stream race around the body path.',
  },
]

export default function CirculationVisualizer() {
  const [mode, setMode] = useState('both')
  const active = MODES.find(m => m.id === mode)

  useEffect(() => { setCirculationMode(mode) }, [mode])

  return (
    <div className="circ-viz">
      <div className="circ-toggle">
        {MODES.map(m => (
          <button
            key={m.id}
            className={mode === m.id ? 'active' : ''}
            onClick={() => setMode(m.id)}
          >
            {m.icon} {m.name.split(' ')[0]}
          </button>
        ))}
      </div>
      <p className="circ-text">{active.text}</p>
      <div className="circ-legend">
        <span><i style={{ background: '#2563EB' }} /> Deoxygenated — pulmonary</span>
        <span><i style={{ background: '#00F2FE' }} /> Oxygenated — systemic</span>
      </div>
    </div>
  )
}
