/**
 * NodalConduction.jsx — PUC: conduction system ⇄ live ECG lock
 * ─────────────────────────────────────────────────────────────
 * Enables the engine's conduction overlay, then displays a LIVE node
 * tracker: SA → AV → His → Purkinje, each lighting exactly when the
 * corresponding wave (P / PR / QRS onset / QRS) sweeps the ECG card.
 */

import { useEffect, useState } from 'react'
import {
  setConductionOverlay,
  subscribeEngineState,
} from '../../../simulation/cardiacEngine'

const NODES = [
  { id: 'SA',       name: 'SA Node (Pacemaker)',  wave: 'P wave',   color: '#FF2E93', fact: 'Fires 60–100/min. Sets the heart rate for everything downstream.' },
  { id: 'AV',       name: 'AV Node',              wave: 'PR segment', color: '#F59E0B', fact: 'The only electrical bridge between atria & ventricles. Delays ~0.1 s so atria finish filling them.' },
  { id: 'HIS',      name: 'Bundle of His',        wave: 'QRS onset', color: '#00F2FE', fact: 'Races down the interventricular septum — the fast highway.' },
  { id: 'PURKINJE', name: 'Purkinje Fibres',      wave: 'QRS complex', color: '#10B981', fact: 'Spread through ventricular walls → near-simultaneous contraction from apex up.' },
  { id: 'T',        name: 'Repolarisation',       wave: 'T wave',    color: '#8B9BB4', fact: 'Ventricles electrically reset — ready for the next beat.' },
]

export default function NodalConduction({ onHeartSync }) {
  const [active, setActive] = useState(null)

  // enable overlay on mount, restore off when unmounted
  useEffect(() => {
    setConductionOverlay(true)
    return () => setConductionOverlay(false)
  }, [])

  useEffect(() => (
    subscribeEngineState(s => setActive(s.conductionNode), 15)
  ), [])

  return (
    <div className="nodal">
      <p className="nodal-intro">
        Watch the impulse travel — each row lights in step with its wave on the ECG.
      </p>
      <div className="nodal-track">
        {NODES.map((n, i) => {
          const on = active === n.id
          const passed = active && NODES.findIndex(x => x.id === active) > i
          return (
            <div key={n.id} className={`nodal-row ${on ? 'active' : ''} ${passed ? 'passed' : ''}`}
                 style={{ '--nc': n.color }}>
              <span className="nodal-dot" />
              <div className="nodal-text">
                <strong>{n.name}</strong>
                <small>↳ {n.wave}{on ? ' · FIRING NOW' : ''}</small>
                {on && <em>{n.fact}</em>}
              </div>
              {i < NODES.length - 1 && <span className="nodal-arrow">↓</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
