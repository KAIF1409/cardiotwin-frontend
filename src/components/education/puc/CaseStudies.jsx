/**
 * CaseStudies.jsx — PUC: clinical decision-tree cases
 * ────────────────────────────────────────────────────
 * Wraps the existing ClinicalCases engine and adds real-time heart
 * responses: choosing an answer drives the twin (params + view mode)
 * so the 3-D heart & graphs react to the student's diagnosis.
 */

import { useEffect, useState } from 'react'

const CASES = [
  {
    title: '67M — breathless at rest, ankle oedema',
    steps: [
      {
        q: 'JVP raised, bibasal crepitations, S3 gallop. First suspicion?',
        options: ['Asthma', 'Heart failure', 'Pneumothorax', 'Anaemia'],
        answer: 1,
        exp: 'Raised JVP + creps + S3 = congestive failure. Fluid backs up into the lungs.',
      },
      {
        q: 'Echo: EF 28%, dilated LV. Which mechanism explains it?',
        options: ['Valve too narrow', 'Weak contraction (low inotropy)', 'High lung pressure', 'Too much preload only'],
        answer: 1,
        exp: 'EF 28% = systolic failure: the muscle cannot shorten forcefully — watch contractility collapse on the sliders.',
      },
    ],
    heart: { Preload: 75, Afterload: 75, Contractility: 20, 'Infarct %': 45, 'Valve Area': 100 },
    view: 'deform',
    diagnosis: 'Heart Failure with reduced EF (HFrEF)',
    color: '#FF2E93',
  },
  {
    title: '19F — collapse during a race; uncle died suddenly at 32',
    steps: [
      {
        q: 'Ejection systolic murmur ↑ on Valsalva. Most likely?',
        options: ['Aortic stenosis', 'Hypertrophic cardiomyopathy', 'Mitral regurgitation', 'Normal athlete'],
        answer: 1,
        exp: 'Valsalva shrinks the LV → worsens LVOT obstruction → louder murmur: classic HCM.',
      },
      {
        q: 'Best prevention for sudden death here?',
        options: ['Aspirin', 'Statin', 'ICD implantation', 'Antibiotics'],
        answer: 2,
        exp: 'An ICD detects the lethal arrhythmia and shocks it — HCM is the top cause of SCD in young athletes.',
      },
    ],
    heart: { Preload: 40, Afterload: 70, Contractility: 85, 'Infarct %': 0, 'Valve Area': 55 },
    view: 'full',
    diagnosis: 'Hypertrophic Cardiomyopathy (HCM)',
    color: '#F59E0B',
  },
  {
    title: '58M — crushing chest pain 2 h, ST elevation V1–V4',
    steps: [
      {
        q: 'Which artery is occluded?',
        options: ['Right coronary', 'Left anterior descending', 'Circumflex', 'Pulmonary artery'],
        answer: 1,
        exp: 'V1–V4 = anterior wall = LAD territory. "Widow-maker" occlusion.',
      },
      {
        q: 'Immediate treatment of choice?',
        options: ['Primary PCI within 90 min', 'Discharge with painkillers', 'Physiotherapy', 'Antibiotics'],
        answer: 0,
        exp: 'Time = muscle. Emergency angioplasty reopens the artery before the myocardium dies completely.',
      },
    ],
    heart: { Preload: 65, Afterload: 70, Contractility: 30, 'Infarct %': 70, 'Valve Area': 90 },
    view: 'deform',
    diagnosis: 'Acute Anterior STEMI',
    color: '#ef5350',
  },
]

export default function CaseStudies({ onHeartSync }) {
  const [ci, setCi]         = useState(0)
  const [si, setSi]         = useState(0)
  const [picked, setPicked] = useState(null)
  const [solved, setSolved] = useState(false)

  const c   = CASES[ci]
  const step = c.steps[si]

  // drive the twin to the case's endpoint once fully solved
  useEffect(() => {
    if (solved) onHeartSync(c.heart, c.view)
  }, [solved, ci, c, onHeartSync])

  const choose = k => { if (picked === null) setPicked(k) }

  const nextStep = () => {
    if (si + 1 < c.steps.length) { setSi(si + 1); setPicked(null) }
    else setSolved(true)
  }

  const restart = () => { setCi(i => i); setSi(0); setPicked(null); setSolved(false) }
  const nextCase = () => {
    setCi((ci + 1) % CASES.length); setSi(0); setPicked(null); setSolved(false)
  }

  return (
    <div className="cases">
      <div className="case-title" style={{ borderLeftColor: c.color }}>{c.title}</div>

      {!solved ? (
        <>
          <p className="quiz-q"><b>Q{si + 1}.</b> {step.q}</p>
          <div className="quiz-options">
            {step.options.map((opt, k) => {
              let cls = ''
              if (picked !== null) cls = k === step.answer ? 'correct' : k === picked ? 'wrong' : ''
              return (
                <button key={k} className={cls} disabled={picked !== null} onClick={() => choose(k)}>{opt}</button>
              )
            })}
          </div>
          {picked !== null && (
            <>
              <div className="quiz-exp" data-tone={picked === step.answer ? 'good' : 'bad'}>
                <strong>{picked === step.answer ? '✅ Good call.' : '❌ Reconsider.'}</strong> {step.exp}
              </div>
              <button className="primary full" onClick={nextStep}>
                {si + 1 >= c.steps.length ? 'Reveal Diagnosis →' : 'Next →'}
              </button>
            </>
          )}
        </>
      ) : (
        <div className="case-result">
          <span className="case-dx" style={{ color: c.color }}>🩺 {c.diagnosis}</span>
          <p>The digital twin has been switched to match this pathology — explore the ECG, PV loop &amp; strain changes.</p>
          <div className="case-actions">
            <button onClick={() => restart()}>↺ Review Case</button>
            <button className="primary" onClick={nextCase}>Next Case →</button>
          </div>
        </div>
      )}
    </div>
  )
}
