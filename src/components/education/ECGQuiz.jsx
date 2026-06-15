import { useState, useEffect } from 'react'

const QUESTIONS = [
  {
    id: 1,
    scenario: 'Patient: 65M, chest pain 2hrs, diaphoretic',
    pattern: 'heartFailure',
    ecgDesc: '⚡ Wide QRS, low R wave, flat T waves, slow rate',
    heartParams: { Preload: 75, Afterload: 75, Contractility: 20, 'Infarct %': 45, 'Valve Area': 100 },
    heartView: 'deform',
    options: ['Normal Sinus Rhythm', 'STEMI', 'Heart Failure Pattern', 'Atrial Fibrillation'],
    answer: 2,
    explanation: 'Wide QRS with low R wave amplitude and flat T waves are classic for heart failure with reduced EF. Combined with clinical picture this suggests acute decompensated heart failure.'
  },
  {
    id: 2,
    scenario: 'Patient: 22F, athlete, routine checkup, asymptomatic',
    pattern: 'athlete',
    ecgDesc: '⚡ Tall R wave, narrow QRS, prominent T waves, HR 52 bpm',
    heartParams: { Preload: 80, Afterload: 30, Contractility: 90, 'Infarct %': 0, 'Valve Area': 100 },
    heartView: 'full',
    options: ['Bradycardia — needs pacing', 'Normal athlete ECG', 'Ventricular Tachycardia', 'STEMI'],
    answer: 1,
    explanation: 'Athletes commonly have sinus bradycardia and tall R waves due to increased vagal tone and LV hypertrophy from regular training. This is physiological, not pathological.'
  },
  {
    id: 3,
    scenario: 'Patient: 72M, exertional syncope, aortic systolic murmur',
    pattern: 'valveStenosis',
    ecgDesc: '⚡ Tall P wave, LV strain pattern, prolonged QRS',
    heartParams: { Preload: 60, Afterload: 85, Contractility: 45, 'Infarct %': 0, 'Valve Area': 35 },
    heartView: 'full',
    options: ['Mitral Regurgitation', 'Aortic Stenosis Pattern', 'NSTEMI', 'Pulmonary Embolism'],
    answer: 1,
    explanation: 'Aortic stenosis causes chronic LV pressure overload → LV hypertrophy → strain pattern on ECG. The tall P wave indicates LA enlargement from back pressure.'
  },
  {
    id: 4,
    scenario: 'Patient: 58M, crushing chest pain, ST elevation V1-V4',
    pattern: 'heartFailure',
    ecgDesc: '⚡ ST elevation, Q waves forming, T wave inversion',
    heartParams: { Preload: 65, Afterload: 70, Contractility: 30, 'Infarct %': 70, 'Valve Area': 90 },
    heartView: 'deform',
    options: ['STEMI — anterior', 'Pericarditis', 'Normal variant', 'Right bundle branch block'],
    answer: 0,
    explanation: 'ST elevation in V1-V4 indicates anterior STEMI — LAD territory. Q waves forming indicate myocardial necrosis. Requires immediate primary PCI within 90 minutes.'
  },
  {
    id: 5,
    scenario: 'Patient: 45F, palpitations, irregular pulse, no chest pain',
    pattern: 'normal',
    ecgDesc: '⚡ Irregularly irregular rhythm, no P waves, variable R-R interval',
    heartParams: { Preload: 50, Afterload: 50, Contractility: 50, 'Infarct %': 0, 'Valve Area': 100 },
    heartView: 'full',
    options: ['Normal Sinus Rhythm', 'Ventricular Fibrillation', 'Atrial Fibrillation', 'Complete Heart Block'],
    answer: 2,
    explanation: 'Irregularly irregular rhythm with absent P waves = Atrial Fibrillation. Risk of stroke — needs anticoagulation. Rate control with beta-blockers or digoxin.'
  },
]

const PATTERN_COLORS = {
  normal: '#00e676', heartFailure: '#ef5350',
  athlete: '#00bcd4', valveStenosis: '#ff9800',
}

export default function ECGQuiz({ onClose, onHeartSync }) {
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [finished, setFinished] = useState(false)

  const q = QUESTIONS[current]
  const color = PATTERN_COLORS[q.pattern]

  // Sync heart model whenever question changes
  useEffect(() => {
    onHeartSync?.(q.heartParams, q.heartView)
  }, [current]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnswer = (idx) => {
    if (answered) return
    setSelected(idx)
    setAnswered(true)
    if (idx === q.answer) setScore(s => s + 1)
  }

  const handleNext = () => {
    if (current + 1 >= QUESTIONS.length) { setFinished(true); return }
    setCurrent(c => c + 1)
    setSelected(null)
    setAnswered(false)
  }

  const handleRetry = () => {
    setCurrent(0); setScore(0); setFinished(false)
    setSelected(null); setAnswered(false)
  }

  return (
    <div style={{
      position: 'fixed', bottom: '24px', left: '250px',
      background: '#12121f', border: `2px solid ${finished ? '#00bcd4' : color}`,
      borderRadius: '14px', padding: '16px', width: '400px',
      maxHeight: '80vh', overflowY: 'auto',
      zIndex: 1500, boxShadow: `0 0 30px ${finished ? '#00bcd4' : color}33`,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ color: finished ? '#00bcd4' : color, margin: 0, fontSize: '13px', letterSpacing: '1px' }}>
          ⚡ ECG Quiz
        </h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '16px' }}>✕</button>
      </div>

      {/* Heart sync notice */}
      <div style={{ background: '#001a0a', border: '1px solid #00e67622', borderRadius: '6px', padding: '4px 10px', marginBottom: '10px', fontSize: '10px', color: '#00e676' }}>
        🫀 Heart model + graphs sync to each scenario automatically
      </div>

      {/* FINISHED SCREEN */}
      {finished ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: '42px', fontWeight: 'bold', color: score >= 4 ? '#00e676' : score >= 3 ? '#ff9800' : '#ef5350', marginBottom: '10px' }}>
            {score}/{QUESTIONS.length}
          </div>
          <p style={{ color: '#aaa', fontSize: '12px', marginBottom: '16px' }}>
            {score === 5 ? '🏆 Excellent! You can interpret ECGs like a pro.' :
             score >= 3 ? '👍 Good! Review the explanations to improve.' :
             '📖 Keep studying! ECG interpretation takes practice.'}
          </p>
          <button onClick={handleRetry} style={{
            background: '#00bcd4', border: 'none', color: 'white',
            borderRadius: '8px', padding: '10px 24px', cursor: 'pointer', fontSize: '12px'
          }}>
            🔄 Retry
          </button>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div style={{ background: '#0f0f1a', borderRadius: '4px', height: '4px', marginBottom: '12px' }}>
            <div style={{ background: color, height: '4px', borderRadius: '4px', width: `${(current / QUESTIONS.length) * 100}%`, transition: 'width 0.3s' }} />
          </div>

          {/* Scenario */}
          <div style={{ background: '#0f0f1a', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px', borderLeft: `3px solid ${color}` }}>
            <div style={{ color: '#888', fontSize: '10px', marginBottom: '3px' }}>🏥 CLINICAL SCENARIO</div>
            <div style={{ color: 'white', fontSize: '11px' }}>{q.scenario}</div>
          </div>

          {/* ECG description */}
          <div style={{ background: '#001a0a', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', border: '1px solid #00e67622' }}>
            <div style={{ color: '#00e676', fontSize: '10px', marginBottom: '3px' }}>📈 ECG FINDINGS</div>
            <div style={{ color: '#00e676', fontSize: '11px', fontFamily: 'monospace' }}>{q.ecgDesc}</div>
          </div>

          <p style={{ color: 'white', fontSize: '12px', marginBottom: '10px', fontWeight: '500' }}>
            What is the most likely diagnosis?
          </p>

          {/* Options */}
          {q.options.map((opt, idx) => {
            let bg = '#0f0f1a', border = '#2a2a3e', txtColor = 'white'
            if (answered) {
              if (idx === q.answer) { bg = '#1b5e2088'; border = '#00e676'; txtColor = '#00e676' }
              else if (idx === selected) { bg = '#b71c1c44'; border = '#ef5350'; txtColor = '#ef5350' }
            }
            return (
              <button key={idx} onClick={() => handleAnswer(idx)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: bg, border: `1px solid ${border}`, color: txtColor,
                borderRadius: '8px', padding: '8px 12px', marginBottom: '6px',
                cursor: answered ? 'default' : 'pointer', fontSize: '11px', transition: 'all 0.2s'
              }}>{opt}</button>
            )
          })}

          {/* Explanation */}
          {answered && (
            <div style={{ background: '#0a1a0a', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px', border: '1px solid #00e67622' }}>
              <div style={{ color: '#00e676', fontSize: '10px', marginBottom: '3px' }}>💡 EXPLANATION</div>
              <div style={{ color: '#aaa', fontSize: '11px', lineHeight: '1.5' }}>{q.explanation}</div>
            </div>
          )}

          {/* Next button */}
          {answered && (
            <button onClick={handleNext} style={{
              width: '100%', background: color, border: 'none',
              color: 'white', borderRadius: '8px', padding: '9px',
              cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
            }}>
              {current + 1 >= QUESTIONS.length ? 'See Results →' : 'Next Question →'}
            </button>
          )}

          <div style={{ color: '#444', fontSize: '10px', textAlign: 'right', marginTop: '8px' }}>
            Q{current + 1}/{QUESTIONS.length} · Score: {score}
          </div>
        </>
      )}
    </div>
  )
}