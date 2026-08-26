/**
 * AnatomyTour.jsx — SSLC: guided labeled 3-D tour
 * ────────────────────────────────────────────────
 * Steps highlight each structure; the camera glides to the matching
 * anatomical marker (via onHeartSync → App focus system) and the heart
 * resets to healthy baseline so students see normal anatomy first.
 */

import { useEffect, useState } from 'react'
import { ANATOMY_MARKERS } from '../../HeartLabels'

const STEPS = [
  { id: 'overview', icon: '🫀', name: 'The Heart', text: 'A fist-sized muscular pump in your chest. It beats ~100,000 times a day, pushing blood to your lungs and your whole body.', focus: null },
  { id: 'RA', icon: '🔵', name: 'Right Atrium (RA)', text: 'Receives DEOXYGENATED (carbon-dioxide rich) blood returning from the body through the vena cava. Blue particles flow in here.', focus: 'RA' },
  { id: 'RV', icon: '🔵', name: 'Right Ventricle (RV)', text: 'Pumps the blue blood through the pulmonary artery to the LUNGS to pick up oxygen. It works at low pressure — lungs are close by.', focus: 'RV' },
  { id: 'LA', icon: '🔴', name: 'Left Atrium (LA)', text: 'Receives OXYGENATED (bright red) blood coming back from the lungs through pulmonary veins. Cyan particles flow in here.', focus: 'LA' },
  { id: 'LV', icon: '🔴', name: 'Left Ventricle (LV)', text: 'The strongest chamber! Its thick wall pumps red blood all the way to your toes through the aorta.', focus: 'LV' },
  { id: 'IVS', icon: '🧱', name: 'Septum (IVS)', text: 'The muscular wall dividing left from right. It keeps oxygen-rich and oxygen-poor blood completely separate — that is DOUBLE circulation.', focus: 'IVS' },
  { id: 'MYO', icon: '💪', name: 'Myocardium', text: 'The heart muscle itself. Like any muscle it needs its own blood supply — the coronary arteries.', focus: 'MYO' },
]

export default function AnatomyTour({ onHeartSync }) {
  const [i, setI] = useState(0)
  const step = STEPS[i]

  // Baseline healthy heart whenever tour is open
  useEffect(() => {
    onHeartSync(
      { Preload: 50, Afterload: 50, Contractility: 60, 'Infarct %': 0, 'Valve Area': 100 },
      'chamber',
    )
    return () => { /* hub closes handle reset */ }
  }, [onHeartSync])

  const go = idx => {
    const s = STEPS[Math.max(0, Math.min(STEPS.length - 1, idx))]
    setI(STEPS.indexOf(s))
    if (s.focus) {
      const marker = ANATOMY_MARKERS.find(m => m.id === s.focus)
      if (marker) {
        // reuse the sync channel with a marker hint carried via extra
        onHeartSync(null, 'chamber', { focusMarker: s.focus })
        window.dispatchEvent(new CustomEvent('ct:focus-marker', { detail: s.focus }))
      }
    }
  }

  return (
    <div className="tour">
      <div className="tour-step-head">
        <span className="tour-step-icon">{step.icon}</span>
        <strong>{step.name}</strong>
        <span className="tour-count">{i + 1}/{STEPS.length}</span>
      </div>
      <p className="tour-text">{step.text}</p>

      {/* progress dots */}
      <div className="tour-dots">
        {STEPS.map((s, k) => (
          <button key={s.id} onClick={() => go(k)} className={k === i ? 'on' : ''} title={s.name} />
        ))}
      </div>

      <div className="tour-nav">
        <button disabled={i === 0} onClick={() => go(i - 1)}>← Back</button>
        {i < STEPS.length - 1 ? (
          <button className="primary" onClick={() => go(i + 1)}>Next →</button>
        ) : (
          <button className="primary" onClick={() => go(0)}>🔁 Restart</button>
        )}
      </div>
    </div>
  )
}
