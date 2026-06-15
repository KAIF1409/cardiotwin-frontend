import { useState, useEffect } from 'react'

const CASES = [
  {
    id: 1, title: 'Case 1: The Breathless Banker',
    age: 67, sex: 'M',
    presenting: 'Progressive breathlessness on exertion for 3 months, now breathless at rest. Orthopnoea — sleeps on 3 pillows.',
    vitals: 'HR: 104 bpm | BP: 158/96 mmHg | SpO2: 91% | RR: 22/min',
    examination: 'JVP raised, bibasal crepitations, pitting oedema to knees, S3 gallop',
    ecg: 'Sinus tachycardia, LV strain pattern',
    echo: 'EF 28%, dilated LV, MR moderate',
    diagnosis: 'Heart Failure with Reduced EF (HFrEF)',
    color: '#ef5350',
    heartParams: { Preload: 75, Afterload: 75, Contractility: 20, 'Infarct %': 45, 'Valve Area': 100 },
    heartView: 'deform',
    questions: [
      { q: 'What class of heart failure is this (NYHA)?', options: ['Class I', 'Class II', 'Class III', 'Class IV'], answer: 3, exp: 'NYHA Class IV — symptoms at rest. Class I = no symptoms, II = mild exertion, III = minimal exertion, IV = rest.' },
      { q: 'What is the first-line medication?', options: ['Digoxin', 'ACE inhibitor + Beta blocker', 'Diuretic alone', 'Calcium channel blocker'], answer: 1, exp: 'ACE inhibitor (reduces afterload) + Beta blocker (reduces HR and remodelling) are the cornerstone of HFrEF treatment.' },
      { q: 'Which finding confirms fluid overload?', options: ['Tachycardia', 'Bibasal crepitations + pitting oedema + raised JVP', 'Low SpO2', 'S3 gallop'], answer: 1, exp: 'The triad of raised JVP, bibasal creps and pitting oedema confirms congestive heart failure.' }
    ]
  },
  {
    id: 2, title: 'Case 2: The Syncopal Student',
    age: 19, sex: 'F',
    presenting: 'Sudden collapse during a 5km run. Regained consciousness in 2 mins. Family history: uncle died suddenly aged 32.',
    vitals: 'HR: 58 bpm | BP: 118/72 mmHg | SpO2: 99% | RR: 14/min',
    examination: 'Ejection systolic murmur at left sternal edge, increases on Valsalva',
    ecg: 'LV hypertrophy, deep Q waves in I, aVL, V5-V6',
    echo: 'Asymmetric septal hypertrophy, LVOT obstruction, EF 75%',
    diagnosis: 'Hypertrophic Cardiomyopathy (HCM)',
    color: '#ff9800',
    heartParams: { Preload: 80, Afterload: 30, Contractility: 90, 'Infarct %': 0, 'Valve Area': 100 },
    heartView: 'full',
    questions: [
      { q: 'Why does the murmur increase on Valsalva?', options: ['Increases venous return', 'Reduces preload — worsens LVOT obstruction', 'Increases afterload', 'Slows heart rate'], answer: 1, exp: 'Valsalva reduces venous return → less blood in LV → LVOT obstruction worsens → louder murmur. Pathognomonic for HCM.' },
      { q: 'What is the most dangerous complication?', options: ['AF', 'Sudden cardiac death', 'Stroke', 'Heart failure'], answer: 1, exp: 'HCM is the commonest cause of sudden cardiac death in young athletes.' },
      { q: 'What is the treatment to prevent sudden death?', options: ['Beta blocker alone', 'ICD implantation', 'Aspirin', 'Statins'], answer: 1, exp: 'ICD implantation is indicated in high-risk HCM patients to prevent sudden cardiac death.' }
    ]
  },
  {
    id: 3, title: 'Case 3: The Tired Teacher',
    age: 54, sex: 'F',
    presenting: 'Fatigue and exertional dyspnoea for 6 months. Recently noticed ankle swelling.',
    vitals: 'HR: 88 bpm | BP: 145/88 mmHg | SpO2: 96% | RR: 18/min',
    examination: 'Slow rising pulse, ejection systolic murmur radiating to carotids',
    ecg: 'LV hypertrophy, strain pattern',
    echo: 'Aortic valve area 0.8 cm², peak gradient 64 mmHg, EF 55%',
    diagnosis: 'Severe Aortic Stenosis',
    color: '#ab47bc',
    heartParams: { Preload: 60, Afterload: 85, Contractility: 45, 'Infarct %': 0, 'Valve Area': 35 },
    heartView: 'full',
    questions: [
      { q: 'What aortic valve area defines severe stenosis?', options: ['>2.0 cm²', '1.0–2.0 cm²', '<1.0 cm²', '<0.5 cm²'], answer: 2, exp: 'Severe AS = valve area <1.0 cm². This patient at 0.8 cm² has severe AS.' },
      { q: 'What is the classic symptom triad of AS?', options: ['Fever, rash, joint pain', 'Angina, syncope, heart failure', 'Palpitations, AF, stroke', 'Cough, haemoptysis, pleurisy'], answer: 1, exp: 'Classic AS triad: Angina, Syncope, Heart Failure.' },
      { q: 'What is the treatment of choice?', options: ['Medical therapy only', 'Balloon valvuloplasty', 'TAVI or surgical AVR', 'ACE inhibitor'], answer: 2, exp: 'TAVI or surgical AVR. TAVI preferred in elderly/high risk.' }
    ]
  }
]

export default function ClinicalCases({ onClose, onHeartSync }) {
  const [caseIdx, setCaseIdx] = useState(0)
  const [qIdx, setQIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState('history')

  const cas = CASES[caseIdx]
  const q = cas.questions[qIdx]

  // Sync heart whenever case changes
  useEffect(() => {
    onHeartSync?.(cas.heartParams, cas.heartView)
  }, [caseIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnswer = (idx) => {
    if (answered) return
    setSelected(idx)
    setAnswered(true)
    if (idx === q.answer) setScore(s => s + 1)
  }

  const handleNext = () => {
    if (qIdx + 1 >= cas.questions.length) { setPhase('result'); return }
    setQIdx(qi => qi + 1)
    setSelected(null)
    setAnswered(false)
  }

  const nextCase = () => {
    if (caseIdx + 1 >= CASES.length) { onClose(); return }
    setCaseIdx(ci => ci + 1)
    setQIdx(0); setSelected(null); setAnswered(false)
    setPhase('history'); setScore(0)
  }

  const switchCase = (i) => {
    setCaseIdx(i); setQIdx(0); setSelected(null); setAnswered(false)
    setPhase('history'); setScore(0)
  }

  return (
    <div style={{
      position: 'fixed', bottom: '24px', left: '250px',
      background: '#12121f', border: `2px solid ${cas.color}`,
      borderRadius: '14px', padding: '16px', width: '400px',
      maxHeight: '80vh', overflowY: 'auto',
      zIndex: 1500, boxShadow: `0 0 30px ${cas.color}33`,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ color: cas.color, margin: 0, fontSize: '13px', letterSpacing: '1px' }}>
          🏥 Clinical Cases
        </h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '16px' }}>✕</button>
      </div>

      {/* Heart sync notice */}
      <div style={{ background: '#001a0a', border: '1px solid #00e67622', borderRadius: '6px', padding: '4px 10px', marginBottom: '10px', fontSize: '10px', color: '#00e676' }}>
        🫀 Heart model + graphs sync to each patient automatically
      </div>

      {/* Case tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
        {CASES.map((c, i) => (
          <button key={i} onClick={() => switchCase(i)}
            style={{
              flex: 1, padding: '5px 0', fontSize: '10px', borderRadius: '6px', cursor: 'pointer',
              background: caseIdx === i ? cas.color : '#0f0f1a',
              color: caseIdx === i ? 'white' : '#555',
              border: `1px solid ${caseIdx === i ? cas.color : '#2a2a3e'}`
            }}>
            Case {i + 1}
          </button>
        ))}
      </div>

      {/* Title */}
      <div style={{ color: cas.color, fontSize: '11px', fontWeight: 'bold', marginBottom: '10px' }}>
        {cas.title}
      </div>

      {/* HISTORY PHASE */}
      {phase === 'history' && (
        <>
          <div style={{ background: '#0f0f1a', borderRadius: '8px', padding: '8px 10px', marginBottom: '8px' }}>
            <div style={{ color: cas.color, fontSize: '10px', fontWeight: 'bold', marginBottom: '4px' }}>👤 PATIENT</div>
            <div style={{ color: '#aaa', fontSize: '11px' }}>Age: {cas.age} | Sex: {cas.sex}</div>
          </div>
          {[
            { label: '🩺 Presenting Complaint', text: cas.presenting },
            { label: '📊 Vitals', text: cas.vitals },
            { label: '🔍 Examination', text: cas.examination },
            { label: '⚡ ECG', text: cas.ecg },
            { label: '🫀 Echo', text: cas.echo },
          ].map(({ label, text }) => (
            <div key={label} style={{ background: '#0f0f1a', borderRadius: '8px', padding: '8px 10px', marginBottom: '6px', borderLeft: `3px solid ${cas.color}44` }}>
              <div style={{ color: cas.color, fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>{label}</div>
              <div style={{ color: '#ccc', fontSize: '11px', lineHeight: '1.5' }}>{text}</div>
            </div>
          ))}
          <button onClick={() => setPhase('questions')} style={{
            width: '100%', marginTop: '6px', background: cas.color, border: 'none',
            color: 'white', borderRadius: '8px', padding: '10px',
            cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
          }}>
            Answer Questions →
          </button>
        </>
      )}

      {/* QUESTIONS PHASE */}
      {phase === 'questions' && (
        <>
          <div style={{ background: '#0f0f1a', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', borderLeft: `3px solid ${cas.color}` }}>
            <div style={{ color: cas.color, fontSize: '10px', marginBottom: '3px' }}>Q{qIdx + 1}/{cas.questions.length}</div>
            <div style={{ color: 'white', fontSize: '12px', fontWeight: '500' }}>{q.q}</div>
          </div>
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
          {answered && (
            <>
              <div style={{ background: '#0a1a0a', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px', border: '1px solid #00e67622' }}>
                <div style={{ color: '#00e676', fontSize: '10px', marginBottom: '3px' }}>💡 EXPLANATION</div>
                <div style={{ color: '#aaa', fontSize: '11px', lineHeight: '1.5' }}>{q.exp}</div>
              </div>
              <button onClick={handleNext} style={{
                width: '100%', background: cas.color, border: 'none',
                color: 'white', borderRadius: '8px', padding: '8px',
                cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
              }}>
                {qIdx + 1 >= cas.questions.length ? 'See Diagnosis →' : 'Next Question →'}
              </button>
            </>
          )}
        </>
      )}

      {/* RESULT PHASE */}
      {phase === 'result' && (
        <div style={{ textAlign: 'center', padding: '8px' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Diagnosis:</div>
          <div style={{ fontSize: '15px', fontWeight: 'bold', color: cas.color, marginBottom: '12px' }}>{cas.diagnosis}</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: score >= 2 ? '#00e676' : '#ff9800', marginBottom: '10px' }}>{score}/{cas.questions.length}</div>
          <p style={{ color: '#aaa', fontSize: '11px', marginBottom: '12px' }}>{score === cas.questions.length ? '🏆 Perfect clinical reasoning!' : '📖 Review the explanations and try again.'}</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button onClick={() => { setPhase('history'); setQIdx(0); setScore(0); setSelected(null); setAnswered(false) }}
              style={{ background: '#0f0f1a', border: `1px solid ${cas.color}`, color: cas.color, borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '11px' }}>
              Review Case
            </button>
            <button onClick={nextCase}
              style={{ background: cas.color, border: 'none', color: 'white', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
              {caseIdx + 1 >= CASES.length ? 'Finish ✓' : 'Next Case →'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}