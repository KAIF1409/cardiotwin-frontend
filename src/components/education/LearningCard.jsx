const CHAMBER_DATA = {
  LV: {
    name: 'Left Ventricle',
    color: '#42a5f5',
    icon: '🫀',
    function: 'Pumps oxygenated blood to the entire body via the aorta',
    pressure: '120/8 mmHg (systolic/diastolic)',
    volume: 'EDV: 120-140ml | ESV: 50-60ml',
    ef: 'Normal EF: 55-70%',
    disease: 'Dysfunction → Systolic heart failure, low EF',
    fact: 'The LV wall is 3x thicker than the RV — it needs to generate the highest pressure in the heart'
  },
  RV: {
    name: 'Right Ventricle',
    color: '#ef5350',
    icon: '🫀',
    function: 'Pumps deoxygenated blood to the lungs via the pulmonary artery',
    pressure: '25/4 mmHg',
    volume: 'Lower volume than LV',
    ef: 'Normal EF: 45-55%',
    disease: 'Failure → Fluid backup, leg swelling, breathlessness',
    fact: 'The RV operates at 1/5 the pressure of the LV — it only needs to push blood to the nearby lungs'
  },
  LA: {
    name: 'Left Atrium',
    color: '#ce93d8',
    icon: '🫀',
    function: 'Receives oxygenated blood from 4 pulmonary veins',
    pressure: '8-12 mmHg',
    volume: 'Reservoir before mitral valve opens',
    ef: 'Atrial booster function',
    disease: 'Enlargement → Atrial fibrillation, mitral stenosis',
    fact: 'The LA is the most posterior chamber — it sits right in front of the esophagus'
  },
  RA: {
    name: 'Right Atrium',
    color: '#f48fb1',
    icon: '🫀',
    function: 'Receives deoxygenated blood from superior and inferior vena cava',
    pressure: '2-6 mmHg',
    volume: 'Low pressure reservoir',
    ef: 'Feeds RV through tricuspid valve',
    disease: 'Enlargement → Pulmonary hypertension, tricuspid regurgitation',
    fact: 'The SA node — the heart\'s natural pacemaker — sits in the wall of the RA'
  }
}

export default function LearningCard({ selected, onClose }) {
  if (!selected || !CHAMBER_DATA[selected]) return null
  const c = CHAMBER_DATA[selected]

  return (
    <div style={{
      position: 'fixed', top: '60px', left: '250px',
      background: '#1a1a2e', border: `2px solid ${c.color}`,
      borderRadius: '12px', padding: '16px', width: '280px',
      zIndex: 1000, boxShadow: `0 0 24px ${c.color}44`,
      animation: 'fadeIn 0.3s ease'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ color: c.color, margin: 0, fontSize: '14px' }}>{c.icon} {c.name}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px' }}>✕</button>
      </div>
      {[
        { label: '🎯 Function', text: c.function },
        { label: '💨 Pressure', text: c.pressure },
        { label: '📦 Volume', text: c.volume },
        { label: '📊 EF', text: c.ef },
        { label: '⚠️ Disease', text: c.disease },
        { label: '💡 Key Fact', text: c.fact },
      ].map(({ label, text }) => (
        <div key={label} style={{ marginBottom: '8px' }}>
          <div style={{ color: c.color, fontSize: '11px', fontWeight: 'bold' }}>{label}</div>
          <div style={{ color: '#ccc', fontSize: '11px', lineHeight: '1.5' }}>{text}</div>
        </div>
      ))}
    </div>
  )
}