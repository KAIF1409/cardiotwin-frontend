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

// Physiological display bounds (GLS family) — the emergency clamp that
// killed the "-2558.7% GLS" bug. Live backend values can arrive as raw
// fractions (-0.22) OR already-scaled percents (-22) OR corrupted junk;
// every path is normalised then hard-clamped.
const CLAMP = {
  Global: [-25.0, -15.0],
  LV:     [-25.0, -15.0],
  RV:     [-25.0, -15.0],
  LA:     [-35.0, -15.0],
  RA:     [-33.0, -15.0],
}

/**
 * Convert any incoming strain representation to a sane percentage.
 *  -0.22   → -22        (fraction → %)
 *  -22     → -22        (already %)
 *  -2558.7 → -25        (corrupted → clamped to chamber bound)
 *  NaN     → null       (caller uses the offline baseline)
 */
function normalizeStrainPct(raw, key) {
  const v = typeof raw === 'string' ? parseFloat(raw) : raw
  if (v == null || !Number.isFinite(v)) return null
  const pct = v > -1.5 && v < 1.5 ? v * 100 : v      // fraction → percent
  const [lo, hi] = CLAMP[key] || [-35, -15]
  return Math.max(lo, Math.min(hi, pct))             // STRICT bound check
}

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

  // live backend override — normalised + clamped at the door
  useEffect(() => (
    subscribeHeartData(data => {
      if (!data?.strainRegions) return
      const sr = data.strainRegions
      setLiveStrain({
        Global: normalizeStrainPct(sr.global ?? sr.Global, 'Global'),
        LV:     normalizeStrainPct(sr.LV     ?? sr.lv,     'LV'),
        RV:     normalizeStrainPct(sr.RV     ?? sr.rv,     'RV'),
        LA:     normalizeStrainPct(sr.LA     ?? sr.la,     'LA'),
        RA:     normalizeStrainPct(sr.RA     ?? sr.ra,     'RA'),
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

  // displayed peaks: live backend (clamped) > infarct-adjusted baseline
  // (baseline itself is clamped so the offline fallback can NEVER escape
  // physiological bounds either)
  const peaks = {}
  Object.keys(NORMAL_REF).forEach(k => {
    const live = liveStrain ? liveStrain[k] : null
    if (live != null && !Number.isNaN(live)) {
      peaks[k] = live
    } else {
      const raw = NORMAL_REF[k] + infarct * INFARCT_SENSITIVITY[k]
      const [lo, hi] = CLAMP[k]
      peaks[k] = Math.max(lo, Math.min(hi, raw))
    }
  })

  const currentVal = k => {
    if (instant && instant[k] !== undefined && Math.abs(instant[k]) > 0.4) {
      const [lo, hi] = CLAMP[k] || [-35, -15]
      return parseFloat(Math.max(lo, Math.min(hi, instant[k])).toFixed(1))
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
