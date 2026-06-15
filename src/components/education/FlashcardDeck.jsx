import { useState, useEffect } from 'react'

const CARDS = [
  {
    id: 'LV1', structure: 'LV', color: '#00bcd4',
    front: 'What is the normal Ejection Fraction of the Left Ventricle?',
    back: '55–70%\n\nEF = (EDV - ESV) / EDV × 100\n\nBelow 40% = Heart Failure with Reduced EF (HFrEF)',
    category: 'Physiology',
    heartParams: { Preload: 50, Afterload: 50, Contractility: 60, 'Infarct %': 0, 'Valve Area': 100 },
    heartView: 'full',
  },
  {
    id: 'LV2', structure: 'LV', color: '#00bcd4',
    front: 'What happens to the LV in high Afterload?',
    back: 'The LV must generate higher pressure to overcome resistance.\n\nOver time → LV wall thickens (hypertrophy) → diastolic dysfunction → eventual systolic failure.',
    category: 'Pathophysiology',
    heartParams: { Preload: 55, Afterload: 85, Contractility: 45, 'Infarct %': 0, 'Valve Area': 35 },
    heartView: 'full',
  },
  {
    id: 'RV1', structure: 'RV', color: '#ff9800',
    front: 'What is the normal systolic pressure of the Right Ventricle?',
    back: '15–30 mmHg systolic\n5–12 mmHg diastolic\n\nThe RV operates at 1/5 the pressure of the LV — it only pumps to the lungs.',
    category: 'Physiology',
    heartParams: { Preload: 50, Afterload: 50, Contractility: 60, 'Infarct %': 0, 'Valve Area': 100 },
    heartView: 'full',
  },
  {
    id: 'RV2', structure: 'RV', color: '#ff9800',
    front: 'What is cor pulmonale?',
    back: 'Right heart failure caused by pulmonary hypertension.\n\nCauses: COPD, PE, pulmonary fibrosis.\nSigns: JVP↑, peripheral oedema, hepatomegaly.',
    category: 'Pathology',
    heartParams: { Preload: 75, Afterload: 80, Contractility: 25, 'Infarct %': 30, 'Valve Area': 100 },
    heartView: 'deform',
  },
  {
    id: 'LA1', structure: 'LA', color: '#ab47bc',
    front: 'What causes Left Atrial enlargement?',
    back: '1. Mitral stenosis — LA dilates as blood backs up\n2. Atrial fibrillation — loss of organized contraction\n3. LV failure — raised LA pressure\n\nLA >4 cm = significant enlargement',
    category: 'Pathology',
    heartParams: { Preload: 70, Afterload: 75, Contractility: 35, 'Infarct %': 20, 'Valve Area': 60 },
    heartView: 'full',
  },
  {
    id: 'RA1', structure: 'RA', color: '#ef5350',
    front: 'Where is the SA node located and what does it do?',
    back: "Located in the wall of the Right Atrium, near the superior vena cava.\n\nGenerates 60-100 impulses/min — the heart's natural pacemaker.\n\nDysfunction → sick sinus syndrome.",
    category: 'Anatomy',
    heartParams: { Preload: 50, Afterload: 50, Contractility: 60, 'Infarct %': 0, 'Valve Area': 100 },
    heartView: 'full',
  },
  {
    id: 'Aorta1', structure: 'Aorta', color: '#00e676',
    front: 'What is aortic stenosis and how does it affect the heart?',
    back: 'Narrowing of the aortic valve opening.\n\nEffect: High afterload → LV hypertrophy → reduced EF over time.\n\nClassic triad: Angina, Syncope, Heart Failure.\n\nTreatment: TAVI or surgical valve replacement.',
    category: 'Pathology',
    heartParams: { Preload: 60, Afterload: 90, Contractility: 40, 'Infarct %': 0, 'Valve Area': 30 },
    heartView: 'full',
  },
  {
    id: 'Frank1', structure: 'LV', color: '#00bcd4',
    front: 'Explain the Frank-Starling mechanism',
    back: 'Increased venous return → more stretch of ventricular wall → stronger contraction.\n\n"The heart pumps out what it receives."\n\nRelates Preload → Stroke Volume.\n\nLimits: In heart failure, the curve flattens — more preload does NOT improve output.',
    category: 'Physiology',
    heartParams: { Preload: 80, Afterload: 40, Contractility: 75, 'Infarct %': 0, 'Valve Area': 100 },
    heartView: 'full',
  },
  {
    id: 'MI1', structure: 'MYO', color: '#ff6e6e',
    front: 'What ECG changes are seen in STEMI?',
    back: '1. ST elevation ≥1mm in ≥2 contiguous leads\n2. New LBBB\n3. Later: Q waves (necrosis)\n4. T-wave inversion\n\nTreatment: Primary PCI within 90 mins of presentation.',
    category: 'Clinical',
    heartParams: { Preload: 65, Afterload: 70, Contractility: 30, 'Infarct %': 70, 'Valve Area': 90 },
    heartView: 'deform',
  },
  {
    id: 'CO1', structure: 'LV', color: '#00bcd4',
    front: 'How is Cardiac Output calculated?',
    back: 'CO = Heart Rate × Stroke Volume\n\nNormal: 4–8 L/min at rest\n\nStroke Volume = EDV - ESV\n\nFactors affecting CO:\n• HR: autonomic nervous system\n• SV: preload, afterload, contractility',
    category: 'Physiology',
    heartParams: { Preload: 50, Afterload: 50, Contractility: 60, 'Infarct %': 0, 'Valve Area': 100 },
    heartView: 'full',
  },
  {
    id: 'Valve1', structure: 'Aorta', color: '#00e676',
    front: 'What are the 4 heart valves and their positions?',
    back: 'Tricuspid — between RA and RV\nPulmonic — between RV and pulmonary artery\nMitral — between LA and LV\nAortic — between LV and aorta\n\nMnemonic: "Try Pulling My Aorta"',
    category: 'Anatomy',
    heartParams: { Preload: 50, Afterload: 50, Contractility: 60, 'Infarct %': 0, 'Valve Area': 100 },
    heartView: 'full',
  },
  {
    id: 'BP1', structure: 'Aorta', color: '#00e676',
    front: 'What is the difference between Preload and Afterload?',
    back: 'Preload = volume of blood in ventricle at end of diastole (EDV)\n→ Related to venous return and filling pressure\n\nAfterload = resistance the heart must overcome to eject blood\n→ Related to systemic vascular resistance and aortic pressure\n\nBoth affect Stroke Volume.',
    category: 'Physiology',
    heartParams: { Preload: 50, Afterload: 50, Contractility: 60, 'Infarct %': 0, 'Valve Area': 100 },
    heartView: 'full',
  },
]

const CATEGORIES = ['All', 'Physiology', 'Pathophysiology', 'Pathology', 'Anatomy', 'Clinical']

function FlipCard({ card, onNext, onPrev, current, total }) {
  const [flipped, setFlipped] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          background: card.color + '22', color: card.color,
          border: `1px solid ${card.color}44`,
          borderRadius: '10px', padding: '2px 10px', fontSize: '10px', fontWeight: 'bold'
        }}>{card.category}</span>
        <span style={{ color: '#555', fontSize: '11px' }}>{current} / {total}</span>
      </div>

      <div
        onClick={() => setFlipped(!flipped)}
        style={{
          background: flipped
            ? `linear-gradient(135deg, ${card.color}22, ${card.color}11)`
            : '#1a1a2e',
          border: `2px solid ${flipped ? card.color : '#2a2a3e'}`,
          borderRadius: '12px', padding: '20px',
          minHeight: '180px', cursor: 'pointer',
          transition: 'all 0.3s ease',
          boxShadow: flipped ? `0 0 20px ${card.color}33` : 'none',
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center', gap: '10px'
        }}
      >
        {!flipped ? (
          <>
            <div style={{ color: card.color, fontSize: '10px', fontWeight: 'bold', letterSpacing: '1px' }}>
              ❓ QUESTION — {card.structure}
            </div>
            <div style={{ color: 'white', fontSize: '13px', lineHeight: '1.6', fontWeight: '500' }}>
              {card.front}
            </div>
            <div style={{ color: '#444', fontSize: '10px', textAlign: 'center', marginTop: '8px' }}>
              Tap to reveal answer
            </div>
          </>
        ) : (
          <>
            <div style={{ color: card.color, fontSize: '10px', fontWeight: 'bold', letterSpacing: '1px' }}>
              ✅ ANSWER
            </div>
            <div style={{ color: '#ddd', fontSize: '12px', lineHeight: '1.7', whiteSpace: 'pre-line' }}>
              {card.back}
            </div>
            <div style={{ color: '#444', fontSize: '10px', textAlign: 'center', marginTop: '4px' }}>
              Tap to flip back
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={(e) => { e.stopPropagation(); setFlipped(false); onPrev() }}
          style={{
            flex: 1, background: '#0f0f1a', border: '1px solid #2a2a3e',
            color: '#888', borderRadius: '8px', padding: '8px',
            cursor: 'pointer', fontSize: '12px'
          }}>← Prev</button>
        <button onClick={(e) => { e.stopPropagation(); setFlipped(false); onNext() }}
          style={{
            flex: 1, background: card.color, border: 'none',
            color: 'white', borderRadius: '8px', padding: '8px',
            cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
          }}>Next →</button>
      </div>
    </div>
  )
}

export default function FlashcardDeck({ onClose, onCardChange }) {
  const [category, setCategory] = useState('All')
  const [index, setIndex] = useState(0)

  const filtered = category === 'All' ? CARDS : CARDS.filter(c => c.category === category)
  const current = filtered[index] ?? filtered[0]

  // Fire onCardChange whenever the visible card changes
  useEffect(() => {
    if (current && onCardChange) {
      onCardChange(current.heartParams, current.heartView)
    }
  }, [current, onCardChange])

  const handleNext = () => setIndex(i => (i + 1) % filtered.length)
  const handlePrev = () => setIndex(i => (i - 1 + filtered.length) % filtered.length)
  const handleCategory = (cat) => { setCategory(cat); setIndex(0) }

  return (
    <div style={{
      position: 'fixed', bottom: '24px', left: '250px',
      background: '#12121f', border: '2px solid #00bcd4',
      borderRadius: '14px', padding: '16px', width: '360px',
      zIndex: 1500, boxShadow: '0 0 30px #00bcd433',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <h3 style={{ color: '#00bcd4', margin: 0, fontSize: '13px', letterSpacing: '1px' }}>
          🃏 Anatomy Flashcards
        </h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '16px' }}>✕</button>
      </div>

      {/* Heart sync notice */}
      <div style={{ background: '#001a1a', border: '1px solid #00bcd422', borderRadius: '6px', padding: '4px 10px', marginBottom: '10px', fontSize: '10px', color: '#00bcd4' }}>
        🫀 Heart model + graphs sync to each card automatically
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => handleCategory(cat)} style={{
            background: category === cat ? '#00bcd4' : '#1a1a2e',
            border: `1px solid ${category === cat ? '#00bcd4' : '#2a2a3e'}`,
            color: category === cat ? 'white' : '#666',
            borderRadius: '10px', padding: '3px 10px',
            fontSize: '10px', cursor: 'pointer'
          }}>{cat}</button>
        ))}
      </div>

      {current && (
        <FlipCard
          card={current}
          current={index + 1}
          total={filtered.length}
          onNext={handleNext}
          onPrev={handlePrev}
        />
      )}
    </div>
  )
}