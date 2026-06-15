const chambers = {
  LV: {
    name: 'Left Ventricle',
    color: '#00bcd4',
    role: 'Pumps oxygenated blood to the entire body via the aorta.',
    walls: 'Thickest walls — generates highest pressure (120 mmHg systolic).',
    disease: 'Dysfunction leads to systolic heart failure and low EF.',
    normal: 'EDV: 120–140ml | ESV: 50–60ml | EF: 55–70%'
  },

  RV: {
    name: 'Right Ventricle',
    color: '#ff9800',
    role: 'Pumps deoxygenated blood to the lungs via the pulmonary artery.',
    walls: 'Thin walls — operates at low pressure (25 mmHg systolic).',
    disease: 'Failure causes fluid backup, leg swelling and breathlessness.',
    normal: 'Pressure: 25/5 mmHg | Shares septum with LV'
  },

  LA: {
    name: 'Left Atrium',
    color: '#ab47bc',
    role: 'Receives oxygenated blood from the 4 pulmonary veins.',
    walls: 'Thin walls — acts as a reservoir before mitral valve opens.',
    disease: 'Enlargement linked to atrial fibrillation and mitral stenosis.',
    normal: 'Pressure: 8–12 mmHg | Feeds LV through mitral valve'
  },

  RA: {
    name: 'Right Atrium',
    color: '#ef5350',
    role: 'Receives deoxygenated blood from superior and inferior vena cava.',
    walls: 'Thin walls — low pressure reservoir feeding the RV.',
    disease: 'Enlargement seen in pulmonary hypertension and tricuspid regurgitation.',
    normal: 'Pressure: 2–6 mmHg | Feeds RV through tricuspid valve'
  }
}

export default function ChamberInfo({
  selected,
  onClose
}) {
  // SAFETY FIX
  if (!selected || !chambers[selected]) return null

  const c = chambers[selected]

  return (
    <div
      style={{
        position: 'fixed',
        top: '80px',
        right: '300px',

        background: '#1a1a2e',
        border: `2px solid ${c.color}`,

        borderRadius: '12px',
        padding: '16px',
        width: '260px',

        zIndex: 1000,

        boxShadow: `0 0 20px ${c.color}44`,

        animation: 'fadeIn 0.3s ease',
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
        }}
      >
        <h3
          style={{
            color: c.color,
            margin: 0,
            fontSize: '14px',
          }}
        >
          🫀 {c.name}
        </h3>

        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          ✕
        </button>
      </div>

      {[
        {
          label: '🎯 Role',
          text: c.role,
        },

        {
          label: '🧱 Walls',
          text: c.walls,
        },

        {
          label: '⚠️ Disease',
          text: c.disease,
        },

        {
          label: '📊 Normal',
          text: c.normal,
        },
      ].map(({ label, text }) => (
        <div
          key={label}
          style={{
            marginBottom: '8px',
          }}
        >
          <div
            style={{
              color: c.color,
              fontSize: '11px',
              fontWeight: 'bold',
            }}
          >
            {label}
          </div>

          <div
            style={{
              color: '#ccc',
              fontSize: '11px',
              lineHeight: '1.5',
            }}
          >
            {text}
          </div>
        </div>
      ))}
    </div>
  )
}