/**
 * SliceControls.jsx — v2
 * Fully redesigned to use the App.css design system (no inline junk styles).
 */
export default function SliceControls({
  sliceY, setSliceY,
  sliceAxis, setSliceAxis,
  sliceMode, setSliceMode,
  sweeping, setSweeping,
  sweepSpeed, setSweepSpeed,
}) {
  const axes = [
    { id: 'horizontal', label: '↕ Horizontal', desc: 'Top / Bottom' },
    { id: 'vertical',   label: '↔ Vertical',   desc: 'Left / Right' },
    { id: 'depth',      label: '↗ Depth',       desc: 'Front / Back' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* ── Header row ── */}  
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>✂️ SLICE MODE</h3>
        <button
          className={`view-btn ${sliceMode ? 'active' : ''}`}
          style={{ padding: '4px 12px', fontSize: '11px' }}
          onClick={() => setSliceMode(!sliceMode)}
        >
          {sliceMode ? '● ON' : '○ OFF'}
        </button>
      </div>

      {sliceMode && (
        <>
          {/* Axis selector */}
          <div>
            <div className="slider-label" style={{ marginBottom: '6px' }}>
              <span>Slice axis</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {axes.map(axis => (
                <button
                  key={axis.id}
                  className={`view-btn ${sliceAxis === axis.id ? 'active' : ''}`}
                  style={{ textAlign: 'left', padding: '7px 10px', display: 'flex', justifyContent: 'space-between' }}
                  title={axis.desc}
                  onClick={() => setSliceAxis(axis.id)}
                >
                  <span>{axis.label}</span>
                  <span style={{ fontSize: '9px', opacity: 0.6, fontWeight: 400 }}>{axis.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Manual slice depth */}
          <div className="slider-row" style={{ marginBottom: 0 }}>
            <div className="slider-label">
              <span>Slice depth</span>
              <span>{sliceY.toFixed(1)}</span>
            </div>
            <input
              type="range" min="-3" max="3" step="0.05"
              value={sliceY}
              onChange={e => { setSweeping(false); setSliceY(Number(e.target.value)) }}
            />
          </div>

          <div style={{ borderTop: '1px solid var(--c-border)', margin: '2px 0' }} />

          {/* MRI Auto-sweep */}
          <div className="slider-label" style={{ marginBottom: '4px' }}>
            <span>🏥 MRI AUTO-SWEEP</span>
          </div>

          <button
            className={`view-btn ${sweeping ? 'active' : ''}`}
            style={{ padding: '9px', fontWeight: 700 }}
            onClick={() => setSweeping(!sweeping)}
          >
            {sweeping ? '⏸ Pause Sweep' : '▶ Play MRI Sweep'}
          </button>

          <div className="slider-row" style={{ marginBottom: 0 }}>
            <div className="slider-label">
              <span>Sweep speed</span>
              <span>{sweepSpeed}×</span>
            </div>
            <input
              type="range" min="1" max="5" step="0.5"
              value={sweepSpeed}
              onChange={e => setSweepSpeed(Number(e.target.value))}
            />
          </div>

          {/* Reset */}
          <button
            className="view-btn"
            style={{ padding: '7px' }}
            onClick={() => { setSliceY(3); setSweeping(false) }}
          >
            ↺ Reset to Default
          </button>
        </>
      )}
    </div>
  )
}