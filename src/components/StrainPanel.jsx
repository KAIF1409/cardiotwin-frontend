import { useEffect, useState } from 'react'
import { subscribeHeartData } from '../services/apiService'

const getStrainColor = (val) => {
  const abs = Math.abs(val)
  if (abs >= 18) return '#ab47bc'
  if (abs >= 12) return '#ff9800'
  return '#ef5350'
}

const getStrainLabel = (val) => {
  const abs = Math.abs(val)
  if (abs >= 18) return 'Normal'
  if (abs >= 12) return 'Reduced'
  return 'Abnormal'
}

const BASE_STRAIN        = { LV: -20.5, RV: -26.0, LA: -32.0, RA: -29.5, Global: -22.0 }
const INFARCT_SENSITIVITY= { LV: 0.18,  RV: 0.09,  LA: 0.05,  RA: 0.04,  Global: 0.12  }
const NORMAL_REF         = { LV: -20.5, RV: -26.0, LA: -32.0, RA: -29.5, Global: -22.0 }
const MAX_ABS = 35

export default function StrainPanel({ infarct = 0 }) {
  const [liveStrain, setLiveStrain] = useState(null)
  const [isLive,     setIsLive]     = useState(false)

  useEffect(() => {
    const unsub = subscribeHeartData((data) => {
      // Backend offline — revert to mock
      if (!data) {
        setLiveStrain(null)
        setIsLive(false)
        return
      }
      if (!data.strainRegions) return
      const sr = data.strainRegions
      setLiveStrain({
        LV:     parseFloat((sr.LV     ?? sr.lv     ?? sr.global ?? -0.205).toFixed(3)),
        RV:     parseFloat((sr.RV     ?? sr.rv     ?? -0.26).toFixed(3)),
        LA:     parseFloat((sr.LA     ?? sr.la     ?? -0.32).toFixed(3)),
        RA:     parseFloat((sr.RA     ?? sr.ra     ?? -0.295).toFixed(3)),
        Global: parseFloat((sr.global ?? sr.Global ?? -0.22).toFixed(3)),
      })
      setIsLive(true)
    })
    return () => unsub?.()
  }, [])

  // Build display strain — live values are decimals (e.g. -0.185) → convert to %
  const strain = {}
  Object.keys(BASE_STRAIN).forEach(key => {
    if (liveStrain && liveStrain[key] != null) {
      const raw = liveStrain[key] * 100  // -0.185 → -18.5
      strain[key] = parseFloat(Math.min(-0.5, raw).toFixed(1))
    } else {
      const raw = BASE_STRAIN[key] + (infarct * INFARCT_SENSITIVITY[key])
      strain[key] = parseFloat(Math.min(-0.5, raw).toFixed(1))
    }
  })

  return (
    <div>
      <div className="strain-header">
        <h3 style={{ margin: 0 }}>📐 Strain Values</h3>
        <span className="graph-live-badge" style={{
          color:      isLive ? '#00ff88' : '#888',
          background: isLive ? 'rgba(0,255,136,0.1)' : 'rgba(128,128,128,0.08)',
        }}>
          {isLive ? '⚡ REAL' : '◎ MOCK'}
        </span>
        <span className="strain-baseline-label">
          {infarct > 0 ? `Infarct: ${infarct}%` : 'Baseline'}
        </span>
      </div>

      {/* Summary badges */}
      <div className="strain-summary-row">
        <div className="strain-summary-badge" style={{ borderColor: '#00bcd444', color: '#00bcd4' }}>
          <span className="strain-summary-val">{strain.Global}%</span>
          <span className="strain-summary-lbl">Global GLS</span>
        </div>
        <div className="strain-summary-badge" style={{ borderColor: '#ab47bc44', color: '#ab47bc' }}>
          <span className="strain-summary-val">{strain.LV}%</span>
          <span className="strain-summary-lbl">LV Strain</span>
        </div>
        <div className="strain-summary-badge" style={{ borderColor: '#ff980044', color: '#ff9800' }}>
          <span className="strain-summary-val">{strain.RV}%</span>
          <span className="strain-summary-lbl">RV Strain</span>
        </div>
      </div>

      {Object.entries(strain).map(([key, val]) => {
        const color    = getStrainColor(val)
        const lbl      = getStrainLabel(val)
        const barWidth = Math.min(100, (Math.abs(val) / MAX_ABS) * 100)
        const refWidth = Math.min(100, (Math.abs(NORMAL_REF[key]) / MAX_ABS) * 100)
        const isGlobal = key === 'Global'
        const delta    = parseFloat((val - NORMAL_REF[key]).toFixed(1))

        return (
          <div className="strain-row" key={key}>
            <div className="strain-row-top">
              <span className={isGlobal ? 'strain-key-global' : 'strain-key'}>
                {isGlobal ? '⬡ Global' : key}
              </span>
              <div className="strain-badges">
                <span className="strain-delta" style={{ color: delta >= 0 ? '#ef5350' : '#ab47bc' }}>
                  {delta >= 0 ? '▲' : '▼'}{Math.abs(delta)}
                </span>
                <span className="strain-label-badge"
                  style={{ color, background: `${color}18`, border: `1px solid ${color}44` }}>
                  {lbl}
                </span>
                <strong className="strain-value" style={{ color }}>{val}%</strong>
              </div>
            </div>
            <div className={`strain-bar-bg ${isGlobal ? 'strain-bar-bg-global' : ''}`}
              style={{ position: 'relative' }}>
              <div className="strain-bar-fill" style={{
                width: `${barWidth}%`,
                background: `linear-gradient(90deg, ${color}cc, ${color})`,
                boxShadow: `0 0 4px ${color}66`,
              }} />
              {/* Normal reference line */}
              <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${refWidth}%`, width: '2px',
                background: 'rgba(255,255,255,0.22)', borderRadius: '1px',
              }} title={`Normal: ${NORMAL_REF[key]}%`} />
            </div>
          </div>
        )
      })}

      <div className="strain-legend">
        {[
          { color: '#ab47bc',              label: 'Normal ≥18%' },
          { color: '#ff9800',              label: 'Reduced'     },
          { color: '#ef5350',              label: 'Abnormal'    },
          { color: 'rgba(255,255,255,0.22)', label: '│ Ref'    },
        ].map(({ color, label }) => (
          <div className="strain-legend-item" key={label}>
            <div className="strain-legend-dot"
              style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
            <span className="strain-legend-text">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}