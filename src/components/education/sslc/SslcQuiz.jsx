/**
 * SslcQuiz.jsx — SSLC board-exam MCQ engine
 * ──────────────────────────────────────────
 * NCERT-style questions, score tracking, per-question explanations,
 * and a results screen with grade + retry.
 */

import { useState } from 'react'

const QUESTIONS = [
  {
    q: 'Which chamber of the heart pumps oxygenated blood to the whole body?',
    options: ['Right atrium', 'Right ventricle', 'Left ventricle', 'Left atrium'],
    answer: 2,
    exp: 'The LEFT VENTRICLE has the thickest muscular wall because it must push oxygenated blood through the aorta to every organ.',
  },
  {
    q: 'Blood from the lungs first enters the heart at the —',
    options: ['Left atrium', 'Right atrium', 'Left ventricle', 'Right ventricle'],
    answer: 0,
    exp: 'Oxygenated blood returns via pulmonary veins into the LEFT ATRIUM, then flows through the mitral valve into the left ventricle.',
  },
  {
    q: 'What is "double circulation"?',
    options: [
      'The heart beats twice per breath',
      'Blood passes through the heart twice in one complete body loop',
      'Two hearts working together',
      'Valves opening and closing twice per beat',
    ],
    answer: 1,
    exp: 'Double circulation = pulmonary circuit (heart→lungs→heart) PLUS systemic circuit (heart→body→heart). Blood passes through the heart twice per loop, keeping oxygen-rich and poor blood separate.',
  },
  {
    q: 'Which blood vessel carries DEOXYGENATED blood AWAY from the heart?',
    options: ['Aorta', 'Pulmonary artery', 'Pulmonary vein', 'Coronary artery'],
    answer: 1,
    exp: 'Exception to the rule! The PULMONARY ARTERY carries deoxygenated blood from the RV to the lungs. Arteries usually carry oxygen-rich blood — this is the classic exam exception.',
  },
  {
    q: 'Valves in the heart prevent —',
    options: ['Backflow of blood', 'Blood clotting', 'High pressure', 'Heart attack'],
    answer: 0,
    exp: 'Valves are one-way doors. They stop blood flowing backwards, making sure it moves forward only — e.g. the tricuspid and mitral valves close during ventricular contraction ("lub" sound).',
  },
]

export default function SslcQuiz() {
  const [idx, setIdx]       = useState(0)
  const [picked, setPicked] = useState(null)
  const [score, setScore]   = useState(0)
  const [done, setDone]     = useState(false)

  const q = QUESTIONS[idx]

  const choose = k => {
    if (picked !== null) return
    setPicked(k)
    if (k === q.answer) setScore(s => s + 1)
  }

  const next = () => {
    if (idx + 1 >= QUESTIONS.length) setDone(true)
    else { setIdx(idx + 1); setPicked(null) }
  }

  const restart = () => { setIdx(0); setPicked(null); setScore(0); setDone(false) }

  if (done) {
    const pct = Math.round((score / QUESTIONS.length) * 100)
    return (
      <div className="quiz-result">
        <div className="quiz-score">{score}/{QUESTIONS.length}</div>
        <div className="quiz-grade" data-tone={pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad'}>
          {pct >= 80 ? '🏆 Distinction!' : pct >= 50 ? '👍 Pass — review & retry' : '📖 Revise the tour and try again'}
        </div>
        <button className="primary" onClick={restart}>🔄 Retry Quiz</button>
      </div>
    )
  }

  return (
    <div className="sslq">
      <div className="quiz-progress">
        <div style={{ width: `${((idx + (picked !== null ? 1 : 0)) / QUESTIONS.length) * 100}%` }} />
      </div>
      <p className="quiz-q"><b>Q{idx + 1}.</b> {q.q}</p>
      <div className="quiz-options">
        {q.options.map((opt, k) => {
          let cls = ''
          if (picked !== null) {
            if (k === q.answer) cls = 'correct'
            else if (k === picked) cls = 'wrong'
          }
          return (
            <button key={k} className={cls} onClick={() => choose(k)} disabled={picked !== null}>
              {String.fromCharCode(65 + k)}. {opt}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <>
          <div className="quiz-exp" data-tone={picked === q.answer ? 'good' : 'bad'}>
            <strong>{picked === q.answer ? '✅ Correct!' : '❌ Not quite.'}</strong> {q.exp}
          </div>
          <button className="primary full" onClick={next}>
            {idx + 1 >= QUESTIONS.length ? 'See Results →' : 'Next Question →'}
          </button>
        </>
      )}
      <div className="quiz-foot">Score: {score} · Q{idx + 1} of {QUESTIONS.length}</div>
    </div>
  )
}
