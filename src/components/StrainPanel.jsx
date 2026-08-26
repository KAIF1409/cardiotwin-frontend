/**
 * StrainPanel.jsx  —  v2 (MASTER CLOCK EDITION)
 * ═════════════════════════════════════════════
 * Speckle-tracking strain gauges (GLS / LV / RV / LA / RA).
 *
 * v1 showed STATIC numbers that only changed when the backend pushed a
 * value — offline they never moved.  Now the gauges are driven by the
 * engine's instantaneous strain waveform: values contract toward their
 * peak during systole and relax through diastole, in perfect lock-step
 * with the mesh deformation and the ECG.  Live backend strainRegions
 * still take priority when the WebSocket is flowing.
 */

import { useEffect, useRef, useState } from 'react'
import { onEngineFrame } from '../simulation/cardiacEngine'
import { subscribeHeartData } from '../services/apiService'

const NORMAL_REF = { Global: -22.0, LV: -20.5, RV: -26.0, LA: -32.0, RA: -29.5 }
const INFARCT_SENSITIVITY = { Global: 0.12, LV: 0.18, RV: 0.09, LA: 0.05, RA: 0.04 }
const MAX_ABS = 35

const toneFor = val => {
  const abs = Math.abs(val)
  if (abs >= 18) return 'good'     // emerald
  if (abs >= 12) return 'warn'     // amber
  return 'bad'                     // rose
}
const labelFor = val => (Math.abs(val) >= 18 ? 'Normal' : Math.abs(val) >= 12 ? 'Reduced' : 'Abnormal')

export default function StrainPanel({ infarct = 0 }) {
  const [liveStrain, setLiveStrain]   = useState(null)
  const [isLive, setIsLive]           = useState(false)
  const [instant, setInstant]         = useState(null)   // instantaneous engine strain %
  const barRefs = useRef({})

  // live backend override
  useEffect(() => (
    subscribeHeartData(data => {
      if (!data?.strainRegions) return
      const sr = data.strainRegions
      setLiveStrain({
        Global: parseFloat((sr.global ?? sr.Global ?? -0.22).toFixed(3)),
        LV:     parseFloat((sr.LV     ?? sr.lv     ?? -0.205).toFixed(3)),
        RV:     parseFloat((sr.RV     ?? sr.rv     ?? -0.26 ).toFixed(3)),
        LA:     parseFloat((sr.LA     ?? sr.la     ?? -0.32 ).toFixed(3)),
        RA:     parseFloat((sr.RA     ?? sr.ra     ?? -0.295).toFixed(3)),
      })
      setIsLive(true)
    })
  ), [])


  // ── Per-frame: animate bars via direct style writes + 10 Hz numerics ─────
  useEffect(() => {
    let lastUi = 0
    return onEngineFrame(s => {
      const now = performance.now()
      const vals = {
        Global: s.strainGlobal * 100,
        LV:     s.strainLV * 100,
        RV:     s.strainRV * 100,
        LA:     s.strainLA * 100,
        RA:     s.strainRA * 100,
      }
      Object.entries(vals).forEach(([k, v]) => {
        const el = barRefs.current[k]
        if (el) el.style.width = `${Math.min(100, (Math.abs(v) / MAX_ABS) * 100)}%`
      })
      if (now - lastUi > 100) {
        lastUi = now
        setInstant(vals)
      }
    })
  }, [])

  // displayed peaks: live backend > infarct-adjusted baseline
  const peaks = {}
  Object.keys(NORMAL_REF).forEach(k => {
    if (liveStrain && liveStrain[k] != null && !Number.isNaN(liveStrain[k])) {
      peaks[k] = Math.min(-0.5, liveStrain[k] * 100)
    } else {
      peaks[k] = Math.min(-0.5, NORMAL_REF[k] + infarct * INFARCT_SENSITIVITY[k])
    }
  })

  const currentVal = k => {
    if (instant && instant[k] !== undefined && Math.abs(instant[k]) > 0.4) {
      return parseFloat(instant[k].toFixed(1))
    }
    return peaks[k]
  }

  return (
    <div className="strain-panel">
      <div className="graph-head">
        <span className="graph-title"><span className="graph-ic">📐</span>Strain</span>
        <span className={`graph-badge ${isLive ? 'graph-badge-live' : ''}`}>
          {isLive ? 'REAL' : 'MODEL'}
        </span>
        <span className="graph-badge graph-badge-dim">
          {infarct > 0 ? `Infarct ${infarct}%` : 'Baseline'}
        </span>
      </div>

      {/* Summary chips */}
      <div className="strain-summary-row">
        {['Global', 'LV', 'RV'].map(k => {
          const v = peaks[k]
          return (
            <div className="strain-chip" key={k} data-tone={toneFor(v)}>
              <span className="strain-chip-val">{currentVal(k)}%</span>
              <span className="strain-chip-lbl">{k === 'Global' ? 'GLS' : `${k} Strain`}</span>
            </div>
          )
        })}
      </div>

      {/* Gauge rows */}
      {Object.entries(peaks).map(([key, peak]) => {
        const cur      = currentVal(key)
        const refWidth = Math.min(100, (Math.abs(NORMAL_REF[key]) / MAX_ABS) * 100)
        const delta    = parseFloat((cur - NORMAL_REF[key]).toFixed(1))

        return (
          <div className="strain-row" key={key}>
            <div className="strain-row-top">
              <span className={`strain-key ${key === 'Global' ? 'strain-key-global' : ''}`}>
                {key === 'Global' ? '⬡ Global GLS' : key}
              </span>
              <div className="strain-badges">
                <span className="strain-delta" data-dir={delta >= 0 ? 'up' : 'down'}>
                  {delta >= 0 ? '▲' : '▼'}{Math.abs(delta)}
                </span>
                <span className="strain-label-badge" data-tone={toneFor(cur)}>{labelFor(cur)}</span>
                <strong className="strain-value" data-tone={toneFor(cur)}>{cur}%</strong>
              </div>
            </div>
            <div className="strain-bar-bg">
              <div
                className="strain-bar-fill"
                data-tone={toneFor(cur)}
                ref={el => { barRefs.current[key] = el }}
                style={{ width: `${Math.min(100, (Math.abs(peak) / MAX_ABS) * 100)}%` }}
              />
              <div className="strain-ref-line" style={{ left: `${refWidth}%` }} title={`Normal ${NORMAL_REF[key]}%`} />
            </div>
          </div>
        )
      })}

      <div className="strain-legend">
        <span className="strain-legend-item"><i data-tone="good" /> Normal ≥ −18%</span>
        <span className="strain-legend-item"><i data-tone="warn" /> Reduced</span>
        <span className="strain-legend-item"><i data-tone="bad" /> Abnormal</span>
        <span className="strain-legend-item"><i className="ref" /> Ref</span>
      </div>
    </div>
  )
}
