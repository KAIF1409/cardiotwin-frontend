export default function HeatmapLegend({ infarct }) {
  const levels = [
    { color: '#1565c0', label: 'Healthy' },
    { color: '#00e676', label: 'Mild' },
    { color: '#ff9800', label: 'Moderate' },
    { color: '#ef5350', label: 'Severe' },
    { color: '#888888', label: 'Necrotic' },
  ]

  return (
    <div className="heatmap-legend">
      <p style={{ color: 'var(--text-mut)', margin: '0 0 5px 0', letterSpacing: '.8px' }}>
        🌡️ STRAIN HEATMAP
      </p>
      {levels.map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div style={{ width: '11px', height: '11px', borderRadius: '3px', background: color, boxShadow: `0 0 6px ${color}66` }} />
          <span>{label}</span>
        </div>
      ))}
      <p style={{ color: 'var(--text-dim)', margin: '5px 0 0 0', fontSize: '9px', letterSpacing: '.8px' }}>
        INFARCT {infarct}%
      </p>
    </div>
  )
}
