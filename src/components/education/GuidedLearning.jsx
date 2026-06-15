import { useState, useEffect } from 'react'

const STEPS = [
  {
    title: '🫀 Step 1: The Heart as a Pump',
    target: null,
    preset: { Preload: 50, Afterload: 50, Contractility: 60, 'Infarct %': 0, 'Valve Area': 100 },
    viewMode: 'full',
    content: 'The heart is a muscular pump that circulates blood around the body. It has 4 chambers — 2 atria (top) and 2 ventricles (bottom). Watch it beat in the 3D viewer.',
    highlight: 'Look at the 3D heart pulsing — each beat pumps blood to your lungs and body.',
    metric: 'Normal EF: 55-70% | HR: ~72 bpm | CO: ~5 L/min'
  },
  {
    title: '📦 Step 2: Preload — Filling the Heart',
    target: 'Preload',
    preset: { Preload: 80, Afterload: 50, Contractility: 60, 'Infarct %': 0, 'Valve Area': 100 },
    viewMode: 'full',
    content: 'Preload is the volume of blood filling the ventricle before it contracts. Higher preload = more stretch = stronger contraction (Frank-Starling Law). Watch HR increase as we raise Preload.',
    highlight: 'Notice: ECG scrolls faster and HR number increases as Preload rises.',
    metric: 'High Preload → Higher HR → Higher CO'
  },
  {
    title: '💨 Step 3: Afterload — Resistance to Pumping',
    target: 'Afterload',
    preset: { Preload: 50, Afterload: 85, Contractility: 60, 'Infarct %': 0, 'Valve Area': 100 },
    viewMode: 'full',
    content: 'Afterload is the resistance the heart pumps against. High afterload (like in hypertension) makes the heart work harder, reducing EF over time. Watch EF drop as Afterload rises.',
    highlight: 'Notice: EF drops and PV loop changes shape with high Afterload.',
    metric: 'High Afterload → Low EF → Heart failure risk'
  },
  {
    title: '💪 Step 4: Contractility — Strength of Contraction',
    target: 'Contractility',
    preset: { Preload: 50, Afterload: 50, Contractility: 20, 'Infarct %': 0, 'Valve Area': 100 },
    viewMode: 'full',
    content: 'Contractility is the intrinsic strength of the heart muscle. Low contractility (as in heart failure) means the heart cannot pump effectively even with normal filling. Watch the heart shrink and EF drop.',
    highlight: 'Notice: Heart pulse weakens and EF drops below 40% — heart failure territory.',
    metric: 'Low Contractility → EF < 40% → Systolic Heart Failure'
  },
  {
    title: '🔴 Step 5: Myocardial Infarction',
    target: 'Infarct %',
    preset: { Preload: 65, Afterload: 70, Contractility: 30, 'Infarct %': 70, 'Valve Area': 90 },
    viewMode: 'deform',
    content: 'A heart attack (MI) occurs when a coronary artery is blocked, killing heart muscle. The dead tissue cannot contract — reducing EF and causing strain abnormalities. Switch to Strain view to see the damage.',
    highlight: 'Notice: Heart turns grey in damaged regions. Strain values worsen. ECG shows MI pattern.',
    metric: 'Infarct 70% → Severe EF drop → Emergency treatment needed'
  },
  {
    title: '🫀 Step 6: Valve Stenosis',
    target: 'Valve Area',
    preset: { Preload: 60, Afterload: 85, Contractility: 45, 'Infarct %': 0, 'Valve Area': 35 },
    viewMode: 'full',
    content: 'Valve stenosis is narrowing of a heart valve — most commonly the aortic valve. The reduced opening increases afterload, raising pressure and reducing cardiac output. The PV loop becomes tall and narrow.',
    highlight: 'Notice: PV loop turns orange and becomes narrow. BP Systolic drops. CO reduces.',
    metric: 'Valve Area 35% → Severe Stenosis → TAVI/Surgery needed'
  },
  {
    title: '⚡ Step 7: The Athlete Heart',
    target: null,
    preset: { Preload: 80, Afterload: 30, Contractility: 90, 'Infarct %': 0, 'Valve Area': 100 },
    viewMode: 'full',
    content: 'Regular exercise causes beneficial cardiac adaptations — larger chambers, stronger contraction, lower resting HR. This is the opposite of heart failure — high EF, high CO, low resistance.',
    highlight: 'Notice: Large wide PV loop, high EF, high CO, strong fast pulse.',
    metric: 'Athlete: EF > 65% | CO > 6 L/min | Low Afterload'
  },
]

export default function GuidedLearning({ onClose, onApplyStep }) {
  const [current, setCurrent] = useState(0)
  const step = STEPS[current]
  useEffect(() => {
  onApplyStep?.(STEPS[0])
}, [])

  const handleNext = () => {
    const next = Math.min(current + 1, STEPS.length - 1)
    setCurrent(next)
    onApplyStep(STEPS[next])
  }

  const handlePrev = () => {
    const prev = Math.max(current - 1, 0)
    setCurrent(prev)
    onApplyStep(STEPS[prev])
  }

  const handleSelect = (i) => {
    setCurrent(i)
    onApplyStep(STEPS[i])
  }

  // Apply first step on open
   

  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '300px',
      background: '#1a1a2e', border: '2px solid #00bcd4',
      borderRadius: '12px', padding: '16px', width: '340px',
      zIndex: 1000, boxShadow: '0 0 24px #00bcd444'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ color: '#00bcd4', margin: 0, fontSize: '13px' }}>📚 Guided Learning</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px' }}>✕</button>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
        {STEPS.map((_, i) => (
          <div key={i} onClick={() => handleSelect(i)} style={{
            flex: 1, height: '4px', borderRadius: '2px', cursor: 'pointer',
            background: i === current ? '#00bcd4' : i < current ? '#00bcd488' : '#333',
            transition: 'background 0.2s'
          }} />
        ))}
      </div>

      {/* Step content */}
      <h4 style={{ color: '#00bcd4', fontSize: '12px', margin: '0 0 8px 0' }}>{step.title}</h4>
      <p style={{ color: '#ccc', fontSize: '11px', lineHeight: '1.6', margin: '0 0 8px 0' }}>{step.content}</p>

      {/* Highlight box */}
      <div style={{ background: '#0f0f1a', borderRadius: '6px', padding: '8px', marginBottom: '8px', borderLeft: '3px solid #00bcd4' }}>
        <p style={{ color: '#00bcd4', fontSize: '10px', margin: 0 }}>👁️ {step.highlight}</p>
      </div>

      {/* Metric box */}
      <div style={{ background: '#0f0f1a', borderRadius: '6px', padding: '8px', marginBottom: '12px', borderLeft: '3px solid #ab47bc' }}>
        <p style={{ color: '#ab47bc', fontSize: '10px', margin: 0 }}>📊 {step.metric}</p>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={handlePrev} disabled={current === 0} style={{
          background: '#0f0f1a', border: '1px solid #333', color: current === 0 ? '#444' : '#aaa',
          borderRadius: '6px', padding: '6px 12px', cursor: current === 0 ? 'default' : 'pointer', fontSize: '12px'
        }}>← Prev</button>
        <span style={{ color: '#555', fontSize: '11px' }}>{current + 1} / {STEPS.length}</span>
        <button onClick={handleNext} disabled={current === STEPS.length - 1} style={{
          background: current === STEPS.length - 1 ? '#0f0f1a' : '#00bcd4',
          border: 'none', color: 'white',
          borderRadius: '6px', padding: '6px 12px',
          cursor: current === STEPS.length - 1 ? 'default' : 'pointer', fontSize: '12px'
        }}>Next →</button>
      </div>
    </div>
  )
}