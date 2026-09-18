/**
 * NcertLessonPanel.jsx — student-side NCERT lesson controls (left dock)
 * ═══════════════════════════════════════════════════════════════════════
 * Normal = Class 10 NCERT · Science Ch 6 "Life Processes"
 * Higher = Class 12 NCERT · Ch 18 "Body Fluids and Circulation"track
 *
 * Every card drives the shared 3-D heart through App.js's existing
 * education bridge — handleHeartSync(params, view, extra) where
 * extra = { hr, freezePhase, circulation, conduction, speed } — so a
 * lesson taps the SAME engine singleton that moves ECG / PV loop / mesh.
 * No signup, no login: the panel is present the moment the app loads.
 */

import { useState } from 'react'
import { RefreshCcw, Zap, Activity, Timer, Waves, TrendingUp, Wind } from 'lucide-react'

// Vector glyph per lesson. No emoji anywhere in the interface.
const TOPIC_ICONS = {
  'double-circulation': RefreshCcw,
  'sa-node': Zap,
  'systole-diastole': Activity,
  'cardiac-cycle': Timer,
  'ecg-waves': Waves,
  'frank-starling': TrendingUp,
  'valve-stenosis': Wind
}

const TOPICS = [
  {
    id: 'double-circulation',
    level: 'basic',

    title: 'Double Circulation',
    ncert: 'Core circulation module',
    body: 'Blood passes through the heart TWICE per complete loop: the right side pushes it to the lungs (pulmonary) and the left side pushes it to the rest of the body (systemic). Watch each circuit light up separately.',
    sync: { view: 'full', extra: { circulation: 'systemic' } },
    extraButtons: [
      { label: 'Pulmonary', params: null, view: 'full', extra: { circulation: 'pulmonary' } },
      { label: 'Systemic', params: null, view: 'full', extra: { circulation: 'systemic' } },
      { label: 'Both', params: null, view: 'full', extra: { circulation: 'both' } }
    ]
  },
  {
    id: 'sa-node',
    level: 'basic',

    title: 'The Pacemaker (SA Node)',
    ncert: 'Core conduction module',
    body: 'A special patch of heart muscle in the wall of the right atrium — the sino-atrial node — generates the impulse that starts every heartbeat. That is why it is called the pacemaker of the heart.',
    sync: { view: 'full', extra: { conduction: true, freezePhase: 0.04 } }
  },
  {
    id: 'systole-diastole',
    level: 'basic',

    title: 'Systole & Diastole',
    ncert: 'Core contractility module',
    body: ' Systole = contraction (blood is pushed out); diastole = relaxation (chambers refill). Freeze the twin-ventricle squeeze at each moment and compare the ventricle shape.',
    sync: { view: 'full', extra: { freezePhase: 0.3 } },
    extraButtons: [
      { label: 'Systole (0.30)', params: null, view: 'full', extra: { freezePhase: 0.3 } },
      { label: 'Diastole (0.70)', params: null, view: 'full', extra: { freezePhase: 0.7 } },
      { label: 'Resume', params: null, view: 'full', extra: {} }
    ]
  },
  {
    id: 'cardiac-cycle',
    level: 'advanced',

    title: 'The Cardiac Cycle (0.8 s)',
    ncert: 'Advanced haemodynamics module',
    body: 'One cardiac cycle at 75 bpm lasts about 0.8 s: joint diastole (0.4 s) → atrial systole (0.1 s) → ventricular systole (0.3 s). Slow the engine to inspect every stroke-volume change on the PV loop.',
    sync: { view: 'full', extra: { speed: 0.25 } },
    extraButtons: [{ label: 'Real time', params: null, view: 'full', extra: { speed: 1 } }]
  },
  {
    id: 'ecg-waves',
    level: 'advanced',

    title: 'ECG — P, QRS & T Waves',
    ncert: 'Advanced electrophysiology module',
    body: 'The P wave marks atrial depolarisation, the QRS complex marks ventricular depolarisation, and the T wave marks repolarisation. Watch the conduction overlay fire in the same order.',
    sync: { view: 'full', extra: { conduction: true, speed: 0.5 } }
  },
  {
    id: 'frank-starling',
    level: 'advanced',

    title: 'Frank–Starling: Preload ↔ Stroke Volume',
    ncert: 'Advanced preload module',
    body: 'More venous return stretches the ventricular muscle, and the next contraction is stronger — stroke volume rises with EDV. Raise preload and watch EDV, SV and the PV loop grow together.',
    sync: { params: { Preload: 85, Contractility: 60, Afterload: 50 }, view: 'full', extra: {} }
  },
  {
    id: 'valve-stenosis',
    level: 'advanced',

    title: 'Valve Stenosis & Murmurs',
    ncert: 'Advanced valvular module',
    body: 'A narrowed valve forces blood through a smaller opening, producing a pressure gradient and a murmur. Narrow the valve area and observe the systolic gradient build on the pressures.',
    sync: {
      params: { 'Valve Area': 50, Preload: 50, Contractility: 60, Afterload: 50 },
      view: 'full',
      extra: {}
    }
  }
]

export default function NcertLessonPanel({ onHeartSync }) {
  const [level, setLevel] = useState('basic')
  const [openId, setOpenId] = useState(null)

  const list = TOPICS.filter(t => t.level === level)

  const run = (params, view, extra) => onHeartSync?.(params ?? null, view ?? 'full', extra ?? {})

  return (
    <div className="ncert-panel">
      <p className="dock-hint">
        Tap a lesson — the 3-D heart, ECG and PV loop sync instantly. No login needed.
      </p>

      {/* Normal (Class 10) vs Higher (Class 12) curriculum switch */}
      <div className="ncert-levels" role="tablist" aria-label="NCERT level">
        <button
          role="tab"
          aria-selected={level === 'basic'}
          className={`ncert-level ${level === 'basic' ? 'on' : ''}`}
          onClick={() => {
            setLevel('basic')
            setOpenId(null)
          }}
        >
          Normal<span>Class 10</span>
        </button>
        <button
          role="tab"
          aria-selected={level === 'advanced'}
          className={`ncert-level ${level === 'advanced' ? 'on' : ''}`}
          onClick={() => {
            setLevel('advanced')
            setOpenId(null)
          }}
        >
          Higher<span>Class 12</span>
        </button>
      </div>
      <div className="ncert-cards">
        {list.map(topic => {
          const open = openId === topic.id
          return (
            <article key={topic.id} className={`ncert-card ${open ? 'open' : ''}`}>
              <button
                className="ncert-card-head"
                onClick={() => setOpenId(o => (o === topic.id ? null : topic.id))}
                aria-expanded={open}
              >
                {(() => {
                  const TopicIcon = TOPIC_ICONS[topic.id]
                  return TopicIcon ? (
                    <span className="ncert-ico" aria-hidden="true">
                      <TopicIcon size={15} strokeWidth={1.75} />
                    </span>
                  ) : null
                })()}
                <span className="ncert-title">{topic.title}</span>
                <span className="dock-chev" aria-hidden></span>
              </button>

              {open && (
                <div className="ncert-card-body">
                  <i className="ncert-ref">{topic.ncert}</i>
                  <p>{topic.body}</p>
                  <button
                    className="ncert-sync"
                    onClick={() => run(topic.sync.params, topic.sync.view, topic.sync.extra)}
                  >
                    Sync 3-D Heart
                  </button>
                  {topic.extraButtons && (
                    <div className="ncert-row">
                      {topic.extraButtons.map(btn => (
                        <button
                          key={btn.label}
                          onClick={() => run(btn.params, btn.view, btn.extra)}
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
      <p className="ncert-foot">
        Aligned to NCERT Science — verify with your prescribed textbook edition.
      </p>
    </div>
  )
}
