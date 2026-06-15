import { useState } from 'react'
const PRESETS = {
  '✅ Normal': {
    color: '#00e676',
    params: { Preload: 50, Afterload: 50, Contractility: 60, 'Infarct %': 0, 'Valve Area': 100 }
  },
  '❤️‍🩹 Heart Failure': {
    color: '#ef5350',
    params: { Preload: 75, Afterload: 75, Contractility: 20, 'Infarct %': 45, 'Valve Area': 100 }
  },
  '🫀 Valve Stenosis': {
    color: '#ff9800',
    params: { Preload: 60, Afterload: 85, Contractility: 45, 'Infarct %': 0, 'Valve Area': 35 }
  },
  '⚡ Athlete Heart': {
    color: '#00bcd4',
    params: { Preload: 80, Afterload: 30, Contractility: 90, 'Infarct %': 0, 'Valve Area': 100 }
  },
  '🔴 Myocardial Infarction': {
    color: '#b71c1c',
    params: { Preload: 65, Afterload: 70, Contractility: 30, 'Infarct %': 70, 'Valve Area': 90 }
  },
}

function calcMetrics(p) {
  const infarct = p['Infarct %'] ?? 0
  const valve = p['Valve Area'] ?? 100
  const ef = Math.round((40 + p.Contractility * 0.3) * (1 - infarct * 0.008))
  const hr = Math.round((60 + p.Preload * 0.4) * (1 + infarct * 0.003))
  const co = ((ef / 100) * hr * 0.08 * (valve / 100)).toFixed(1)
  const sbp = Math.round((60 + p.Afterload * 0.9) * (valve / 100))
  return { ef, hr, co, sbp }
}

function MetricRow({ label, a, b, goodHigh = true }) {
  const aNum = parseFloat(a)
  const bNum = parseFloat(b)
  const aWin = goodHigh ? aNum >= bNum : aNum <= bNum
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: '4px', alignItems: 'center', marginBottom: '6px' }}>
      <div style={{
        textAlign: 'right', fontSize: '12px', fontWeight: 'bold',
        color: aWin ? '#00e676' : '#ef5350'
      }}>{a}</div>
      <div style={{ textAlign: 'center', color: '#555', fontSize: '10px' }}>{label}</div>
      <div style={{
        textAlign: 'left', fontSize: '12px', fontWeight: 'bold',
        color: !aWin ? '#00e676' : '#ef5350'
      }}>{b}</div>
    </div>
  )
}

export default function ComparePanel({ onClose }) {
  const keys = Object.keys(PRESETS)
  const [stateA, setStateA] = useState('✅ Normal')
  const [stateB, setStateB] = useState('❤️‍🩹 Heart Failure')

  const mA = calcMetrics(PRESETS[stateA].params)
  const mB = calcMetrics(PRESETS[stateB].params)

  return (
    <div style={{
      position: 'fixed', top: '60px', left: '50%',
      transform: 'translateX(-50%)',
      background: '#1a1a2e', border: '2px solid #00bcd4',
      borderRadius: '12px', padding: '16px', width: '420px',
      zIndex: 2000, boxShadow: '0 0 30px #00bcd444'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3 style={{ color: '#00bcd4', margin: 0, fontSize: '13px' }}>⚖️ Compare Disease States</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px' }}>✕</button>
      </div>

      {/* Selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
        {[{ val: stateA, set: setStateA, color: PRESETS[stateA].color },
          { val: stateB, set: setStateB, color: PRESETS[stateB].color }].map(({ val, set, color }, i) => (
          <select key={i} value={val} onChange={e => set(e.target.value)} style={{
            background: '#0f0f1a', border: `1px solid ${color}`,
            color, borderRadius: '6px', padding: '6px', fontSize: '11px', cursor: 'pointer'
          }}>
            {keys.map(k => <option key={k} value={k} style={{ color: PRESETS[k].color }}>{k}</option>)}
          </select>
        ))}
      </div>

      {/* State labels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: '4px', marginBottom: '10px' }}>
        <div style={{ textAlign: 'right', color: PRESETS[stateA].color, fontSize: '11px', fontWeight: 'bold' }}>{stateA}</div>
        <div style={{ textAlign: 'center', color: '#555', fontSize: '10px' }}>vs</div>
        <div style={{ textAlign: 'left', color: PRESETS[stateB].color, fontSize: '11px', fontWeight: 'bold' }}>{stateB}</div>
      </div>

      {/* Metrics comparison */}
      <MetricRow label="EF %" a={`${mA.ef}%`} b={`${mB.ef}%`} goodHigh={true} />
      <MetricRow label="HR bpm" a={`${mA.hr}`} b={`${mB.hr}`} goodHigh={false} />
      <MetricRow label="CO L/min" a={`${mA.co}`} b={`${mB.co}`} goodHigh={true} />
      <MetricRow label="SBP mmHg" a={`${mA.sbp}`} b={`${mB.sbp}`} goodHigh={false} />

      <p style={{ color: '#555', fontSize: '10px', marginTop: '12px', textAlign: 'center' }}>
        Green = better value • Red = worse value
      </p>
    </div>
  )
}

