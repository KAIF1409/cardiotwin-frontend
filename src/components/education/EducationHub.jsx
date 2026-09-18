/**
 * EducationHub.jsx — curriculum-based learning tracks
 * ══════════════════════════════════════════════════════════════════
 * Floating glass panel with two tracks:
 *
 * Normal (Essential Anatomy)
 * • Guided 3-D anatomy tour → AnatomyTour
 * • Double-circulation visualizer → CirculationVisualizer
 * • Board-exam MCQ quiz → SslcQuiz
 *
 * Higher (Advanced Concepts)
 * • Cardiac-cycle phase lab → CardiacCycleLab
 * • Nodal conduction ⇄ ECG sync → NodalConduction
 * • Clinical case decision trees → CaseStudies
 */

import { useState } from 'react'
import {
  BookOpen,
  GraduationCap,
  X as XIcon,
  Compass,
  Recycle,
  ClipboardCheck,
  Waves,
  Zap,
  Stethoscope
} from 'lucide-react'
import AnatomyTour from './sslc/AnatomyTour'
import CirculationVisualizer from './sslc/CirculationVisualizer'
import SslcQuiz from './sslc/SslcQuiz'
import CardiacCycleLab from './puc/CardiacCycleLab'
import NodalConduction from './puc/NodalConduction'
import CaseStudies from './puc/CaseStudies'

export default function EducationHub({ unlocked = [], onClose, onHeartSync }) {
  const [track, setTrack] = useState('normal')
  const [openModule, setOpenModule] = useState(null)

  const toggleModule = id => setOpenModule(o => (o === id ? null : id))

  const MODULES = {
    normal: [
      {
        id: 'tour',
        Icon: Compass,
        title: 'Interactive 3D Anatomy Tour',
        desc: 'Walk through the 4 chambers, valves & great vessels with a live guide.',
        el: <AnatomyTour onHeartSync={onHeartSync} />
      },
      {
        id: 'circulation',
        Icon: Recycle,
        title: 'Double Circulation Visualizer',
        desc: 'Toggle pulmonary vs systemic circuits and watch each particle path.',
        el: <CirculationVisualizer onHeartSync={onHeartSync} />
      },
      {
        id: 'quiz',
        Icon: ClipboardCheck,
        title: 'Knowledge Check',
        desc: 'Exam-style MCQs with instant scoring and full explanations.',
        el: <SslcQuiz />
      }
    ],
    higher: [
      {
        id: 'cycle',
        Icon: Waves,
        title: 'Cardiac Cycle Phase Lab',
        desc: 'Freeze & scrub the heart through joint diastole → ejection.',
        el: <CardiacCycleLab onHeartSync={onHeartSync} />
      },
      {
        id: 'nodal',
        Icon: Zap,
        title: 'Nodal Conduction System',
        desc: 'SA → AV → His → Purkinje propagation locked to P/QRS/T waves.',
        el: <NodalConduction onHeartSync={onHeartSync} />
      },
      {
        id: 'cases',
        Icon: Stethoscope,
        title: 'Clinical Pathology Cases',
        desc: 'Diagnostic decision trees — the heart responds in real time.',
        el: <CaseStudies onHeartSync={onHeartSync} unlocked={unlocked} />
      }
    ]
  }

  return (
    <div className="edu-hub">
      <div className="edu-head">
        <div className="edu-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={track === 'normal'}
            className={`edu-tab ${track === 'normal' ? 'active' : ''}`}
            onClick={() => setTrack('normal')}
            title="Essential anatomy & circulation"
          >
            <BookOpen size={14} strokeWidth={1.5} />
            Normal Track
          </button>
          <button
            role="tab"
            aria-selected={track === 'higher'}
            className={`edu-tab ${track === 'higher' ? 'active' : ''}`}
            onClick={() => setTrack('higher')}
            title="Advanced cardiac cycle, conduction & clinical cases"
          >
            <GraduationCap size={14} strokeWidth={1.5} />
            Higher Track
          </button>
        </div>
        <button className="edu-close" onClick={onClose} title="Close education panel">
          <XIcon size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="edu-progress-strip" title="Achievements unlocked">
        <div
          className="edu-progress-fill"
          style={{ width: `${Math.min(100, (unlocked.length / 8) * 100)}%` }}
        />
        <span>{unlocked.length} achievements</span>
      </div>
      <div className="edu-modules">
        {MODULES[track].map(m => (
          <section key={m.id} className={`edu-module ${openModule === m.id ? 'open' : ''}`}>
            <button
              className="edu-module-head"
              onClick={() => toggleModule(m.id)}
              aria-expanded={openModule === m.id}
            >
              <span className="edu-module-icon">
                <m.Icon size={15} strokeWidth={1.6} />
              </span>
              <span className="edu-module-text">
                <strong>{m.title}</strong>
                <small>{m.desc}</small>
              </span>
              <span className="dock-chev"></span>
            </button>
            {openModule === m.id && <div className="edu-module-body">{m.el}</div>}
          </section>
        ))}
      </div>
    </div>
  )
}
