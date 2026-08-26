/**
 * EducationHub.jsx — curriculum-based learning tracks (SSLC & PUC)
 * ══════════════════════════════════════════════════════════════════
 * Floating glass panel with two tracks:
 *
 *   📘 SSLC  (Grade 10 · NCERT board level)
 *      • Guided 3-D anatomy tour        → AnatomyTour
 *      • Double-circulation visualizer  → CirculationVisualizer
 *      • Board-exam MCQ quiz            → SslcQuiz
 *
 *   📙 PUC   (Grade 11/12 · NEET level)
 *      • Cardiac-cycle phase lab        → CardiacCycleLab
 *      • Nodal conduction ⇄ ECG sync    → NodalConduction
 *      • Clinical case decision trees   → CaseStudies
 */

import { useState } from 'react'
import AnatomyTour from './sslc/AnatomyTour'
import CirculationVisualizer from './sslc/CirculationVisualizer'
import SslcQuiz from './sslc/SslcQuiz'
import CardiacCycleLab from './puc/CardiacCycleLab'
import NodalConduction from './puc/NodalConduction'
import CaseStudies from './puc/CaseStudies'

export default function EducationHub({ unlocked = [], onClose, onHeartSync }) {
  const [track, setTrack] = useState('sslc')
  const [openModule, setOpenModule] = useState(null)

  const toggleModule = id => setOpenModule(o => (o === id ? null : id))

  const MODULES = {
    sslc: [
      {
        id: 'tour',
        icon: '🗺️',
        title: 'Interactive 3D Anatomy Tour',
        desc: 'Walk through the 4 chambers, valves & great vessels with a live guide.',
        el: <AnatomyTour onHeartSync={onHeartSync} />,
      },
      {
        id: 'circulation',
        icon: '🔁',
        title: 'Double Circulation Visualizer',
        desc: 'Toggle pulmonary vs systemic circuits and watch each particle path.',
        el: <CirculationVisualizer onHeartSync={onHeartSync} />,
      },
      {
        id: 'quiz',
        icon: '📝',
        title: 'SSLC Board Quiz',
        desc: 'Exam-style MCQs with instant scoring and full explanations.',
        el: <SslcQuiz />,
      },
    ],
    puc: [
      {
        id: 'cycle',
        icon: '🔄',
        title: 'Cardiac Cycle Phase Lab',
        desc: 'Freeze & scrub the heart through joint diastole → ejection.',
        el: <CardiacCycleLab onHeartSync={onHeartSync} />,
      },
      {
        id: 'nodal',
        icon: '⚡',
        title: 'Nodal Conduction System',
        desc: 'SA → AV → His → Purkinje propagation locked to P/QRS/T waves.',
        el: <NodalConduction onHeartSync={onHeartSync} />,
      },
      {
        id: 'cases',
        icon: '🏥',
        title: 'Clinical Pathology Cases',
        desc: 'Diagnostic decision trees — the heart responds in real time.',
        el: <CaseStudies onHeartSync={onHeartSync} unlocked={unlocked} />,
      },
    ],
  }

  return (
    <div className="edu-hub">
      <div className="edu-head">
        <div className="edu-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={track === 'sslc'}
            className={`edu-tab ${track === 'sslc' ? 'active' : ''}`}
            onClick={() => setTrack('sslc')}
            title="Grade 10 — NCERT Circulatory Biology"
          >
            📘 SSLC Track
          </button>
          <button
            role="tab"
            aria-selected={track === 'puc'}
            className={`edu-tab ${track === 'puc' ? 'active' : ''}`}
            onClick={() => setTrack('puc')}
            title="Grade 11–12 Pre-University / NEET"
          >
            📙 PUC Track
          </button>
        </div>
        <button className="edu-close" onClick={onClose} title="Close education panel">✕</button>
      </div>

      <div className="edu-progress-strip" title="Achievements unlocked">
        <div className="edu-progress-fill" style={{ width: `${Math.min(100, (unlocked.length / 8) * 100)}%` }} />
        <span>{unlocked.length} achievements</span>
      </div>

      <div className="edu-modules">
        {MODULES[track].map(m => (
          <section key={m.id} className={`edu-module ${openModule === m.id ? 'open' : ''}`}>
            <button className="edu-module-head" onClick={() => toggleModule(m.id)} aria-expanded={openModule === m.id}>
              <span className="edu-module-icon">{m.icon}</span>
              <span className="edu-module-text">
                <strong>{m.title}</strong>
                <small>{m.desc}</small>
              </span>
              <span className="dock-chev">▾</span>
            </button>
            {openModule === m.id && (
              <div className="edu-module-body">{m.el}</div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
