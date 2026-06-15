export default function HeatmapLegend({ infarct }) {
  const levels = [
    { color: '#1565c0', label: 'Healthy' },
    { color: '#00e676', label: 'Mild' },
    { color: '#ff9800', label: 'Moderate' },
    { color: '#ef5350', label: 'Severe' },
    { color: '#888888', label: 'Necrotic' },
  ]

  return (
    <div style={{
      position: 'absolute', bottom: '30px', right: '10px',
      background: 'rgba(0,0,0,0.75)',
      borderRadius: '8px', padding: '8px 12px',
      border: '1px solid #333', fontSize: '11px'
    }}>
      <p style={{ color: '#aaa', margin: '0 0 6px 0' }}>🌡️ Strain Heatmap</p>
      {levels.map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: color }} />
          <span style={{ color: '#ccc' }}>{label}</span>
        </div>
      ))}
      <p style={{ color: '#555', margin: '6px 0 0 0', fontSize: '10px' }}>Infarct: {infarct}%</p>
    </div>
  )
}