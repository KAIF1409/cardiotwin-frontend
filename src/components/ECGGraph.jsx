/**
 * ECGGraph.jsx
 * ============
 * Live ECG waveform chart.
 *
 * BUG FIX (ownerDocument null crash):
 *   Chart.js binds a ResizeObserver immediately on construction.  If the
 *   <canvas> element is not yet attached to the DOM (canvasRef.current is
 *   null), Chart.js internally calls getComputedStyle() on a detached node,
 *   which throws:
 *     "Cannot read properties of null (reading 'ownerDocument')"
 *
 *   Root cause: App.js gates rendering with canvasReady state (set after a
 *   200ms setTimeout in the Canvas onCreated callback).  During the brief
 *   window between the component mounting and canvasReady becoming true, the
 *   chart init useEffect can fire with canvasRef.current === null.
 *
 *   Fix: guard with `if (!canvasRef.current) return` before new Chart().
 *        Also fixed ECGGraph reading `data.voltage` from /simulate_cycle —
 *        the backend returns the field as `ecg`, not `voltage`.
 *
 * Place this file at:  src/components/ECGGraph.jsx
 */

import { useEffect, useRef, useState } from 'react'
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, CategoryScale, Tooltip,
} from 'chart.js'
import { fetchSimulateCycle, subscribeHeartData } from '../services/apiService'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip)

const BUFFER_SIZE = 100

const ECG_PROFILES = {
  normal:        { p: 0.2,  q: -0.1,  r: 1.2, s: -0.2,  t: 0.3,  width: 25 },
  heartFailure:  { p: 0.15, q: -0.15, r: 0.7, s: -0.3,  t: 0.15, width: 30 },
  valveStenosis: { p: 0.3,  q: -0.1,  r: 1.0, s: -0.2,  t: 0.2,  width: 28 },
  athlete:       { p: 0.25, q: -0.05, r: 1.5, s: -0.15, t: 0.4,  width: 22 },
}

function getProfile(ef, hr, infarct) {
  if (infarct > 30 || ef < 40) return ECG_PROFILES.heartFailure
  if (hr > 90)                  return ECG_PROFILES.athlete
  if (hr < 70 && ef >= 55)      return ECG_PROFILES.normal
  return ECG_PROFILES.valveStenosis
}

function getECGSample(pos, profile) {
  const p = pos % profile.width
  if (p === 8)  return profile.p
  if (p === 11) return profile.q
  if (p === 12) return profile.r
  if (p === 13) return profile.s
  if (p === 16) return profile.t
  if (p === 17) return profile.t * 0.5
  return 0
}

export default function ECGGraph({ heartRate = 75, beat, ef = 55, infarct = 0, mockOverride = false, presetKey = 0 }) {
  const canvasRef     = useRef(null)
  const chartRef      = useRef(null)
  const indexRef      = useRef(0)
  const intervalRef   = useRef(null)
  const profileRef    = useRef(ECG_PROFILES.normal)
  const realBufferRef = useRef(null)
  const realIndexRef  = useRef(0)
  const [usingReal, setUsingReal] = useState(false)

  // Derived ECG interval stats — recompute whenever params change
  const prInterval = Math.round(120 + (heartRate < 60 ? 60 : heartRate < 70 ? 40 : heartRate > 90 ? -10 : 20))
  const qrsWidth   = infarct > 50 ? 160 : infarct > 30 || ef < 40 ? 130 : ef < 50 ? 110 : 85
  const qtInterval = Math.round(420 - heartRate * 1.8)
  const rrInterval = Math.round(60000 / heartRate)

  // BUG FIX: when ef/infarct/heartRate change, update the profile AND
  // flush the real buffer so the mock waveform re-seeds immediately.
  // Without flushing realBufferRef, the old fetched waveform keeps
  // playing and the ECG shape never reflects the new disease state.
  useEffect(() => {
    profileRef.current = getProfile(ef, heartRate, infarct)
    // Only flush real buffer when NOT live WebSocket — live data stays
    if (!usingReal) {
      realBufferRef.current = null
      realIndexRef.current  = 0
      indexRef.current      = 0
      // Re-seed chart buffer with new profile so change is instant
      if (chartRef.current) {
        const dataset = chartRef.current.data.datasets[0].data
        for (let i = 0; i < dataset.length; i++) {
          dataset[i] = getECGSample(i, profileRef.current)
        }
        chartRef.current.data.datasets[0].borderColor = '#2acc58'
        chartRef.current.update('none')
      }
    }
  }, [ef, heartRate, infarct]) // eslint-disable-line react-hooks/exhaustive-deps

  // PRESET CHANGE FIX: when presetKey changes (user clicked a disease preset),
  // always force a full reset — clear cached real buffer, reset usingReal,
  // and re-seed the chart with the new disease profile immediately.
  // This ensures ECG shape changes even when backend is online (usingReal=true).
  useEffect(() => {
    if (presetKey === 0) return   // skip initial mount
    profileRef.current    = getProfile(ef, heartRate, infarct)
    realBufferRef.current = null
    realIndexRef.current  = 0
    indexRef.current      = 0
    setUsingReal(false)
    if (chartRef.current) {
      const dataset = chartRef.current.data.datasets[0].data
      for (let i = 0; i < dataset.length; i++) {
        dataset[i] = getECGSample(i, profileRef.current)
      }
      chartRef.current.data.datasets[0].borderColor = '#2acc58'
      chartRef.current.update('none')
    }
  }, [presetKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chart initialisation ──────────────────────────────────────────────────
  useEffect(() => {
    // BUG FIX: canvasRef.current is null when this effect fires before the
    // canvas is attached to the DOM.  Chart.js calls getComputedStyle() on
    // construction which requires an ownerDocument — guard here.
    if (!canvasRef.current) return

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: Array.from({ length: BUFFER_SIZE }, (_, i) => i),
        datasets: [{
          data:        Array(BUFFER_SIZE).fill(0),
          borderColor: '#2acc58',
          borderWidth: 2,
          pointRadius: 0,
          fill:        false,
          tension:     0.3,
        }],
      },
      options: {
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: {
            display: true,
            min: -0.5,
            max: 1.8,
            grid:  { color: 'rgba(171,71,188,0.08)', drawBorder: false },
            ticks: {
              color: '#666',
              font:  { size: 9 },
              maxTicksLimit: 5,
              callback: (v) => v === 0 ? '0' : v === 1 ? '1mV' : '',
            },
          },
        },
      },
    })

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [])

  // ── Subscribe to real-time ECG from backend WebSocket ────────────────────
  // Skip entirely when mockOverride=true (FlashcardDeck / ECGQuiz are driving)
  useEffect(() => {
    if (mockOverride) {
      // Force back to mock mode
      realBufferRef.current = null
      setUsingReal(false)
      if (chartRef.current) {
        chartRef.current.data.datasets[0].borderColor = '#2acc58'
        chartRef.current.update('none')
      }
      return
    }
    const unsub = subscribeHeartData((data) => {
      if (data?.ecg == null || !chartRef.current) return
      setUsingReal(true)
      const dataset = chartRef.current.data.datasets[0].data
      dataset.shift()
      dataset.push(data.ecg)
      chartRef.current.data.datasets[0].borderColor = '#00ff88'
      chartRef.current.update('none')
    })
    return () => unsub?.()
  }, [mockOverride])

  // ── Fetch one full cycle from /simulate_cycle on preset change or startup ──
  // Fetches whenever presetKey changes (preset selected) OR on ef/infarct change.
  // usingReal guard removed — a preset change always forces a fresh fetch so
  // the waveform shape matches the new disease state even when backend is live.
  useEffect(() => {
    if (mockOverride) return
    fetchSimulateCycle().then(data => {
      if (!data?.ecg || data.ecg.length === 0) return // backend offline — keep mock
      realBufferRef.current = data.ecg
      realIndexRef.current  = 0
      setUsingReal(true)
      if (chartRef.current) {
        chartRef.current.data.datasets[0].borderColor = '#00ff88'
        chartRef.current.update('none')
      }
    }).catch(() => {})
  }, [ef, infarct, presetKey, mockOverride]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tick the waveform animation ──────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const speed = Math.round(600 / heartRate)
    intervalRef.current = setInterval(() => {
      if (!chartRef.current) return
      const dataset = chartRef.current.data.datasets[0].data
      let nextValue
      if (realBufferRef.current) {
        nextValue = realBufferRef.current[realIndexRef.current % realBufferRef.current.length]
        realIndexRef.current++
      } else {
        nextValue = getECGSample(indexRef.current++, profileRef.current)
      }
      dataset.shift()
      dataset.push(nextValue)
      chartRef.current.update('none')
    }, speed)
    return () => clearInterval(intervalRef.current)
  }, [heartRate])

  // ── Flash white on each heartbeat ────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || !beat) return
    chartRef.current.data.datasets[0].borderColor = '#ffffff'
    chartRef.current.update('none')
    setTimeout(() => {
      if (!chartRef.current) return
      chartRef.current.data.datasets[0].borderColor = usingReal ? '#00ff88' : '#08ed41'
      chartRef.current.update('none')
    }, 80)
  }, [beat, usingReal])

  const ecgLabel = heartRate < 50 ? '🫀 Severe Bradycardia'  :
                   heartRate > 150 ? '⚡ Ventricular Tachy'   :
                   heartRate > 100 ? '⚡ Tachycardia'         :
                   infarct > 50    ? '🔴 Infarct / Q-waves'   :
                   infarct > 30    ? '❤️‍🩹 Infarct Pattern'   :
                   ef < 30         ? '❤️‍🩹 Severe HF'         :
                   ef < 40         ? '❤️‍🩹 Heart Failure'     :
                   ef > 65         ? '⚡ Hyperdynamic'         :
                   heartRate < 60  ? '✅ Sinus Bradycardia'   :
                   heartRate < 70  ? '✅ Normal Sinus'        : '⚠️ Borderline Pattern'

  return (
    <div>
      <div className="graph-title" style={{ color: usingReal ? '#00ff88' : undefined }}>
        ⚡ ECG — {heartRate} bpm
        {usingReal && <span className="graph-live-badge">Live</span>}
      </div>
      <p className="graph-sub">{ecgLabel}</p>

      <div className="ecg-stats-row">
        <div className="ecg-stat">
          <span className="ecg-stat-val">{prInterval}</span>
          <span className="ecg-stat-lbl">PR ms</span>
        </div>
        <div className="ecg-stat">
          <span className="ecg-stat-val">{qrsWidth}</span>
          <span className="ecg-stat-lbl">QRS ms</span>
        </div>
        <div className="ecg-stat">
          <span className="ecg-stat-val">{qtInterval}</span>
          <span className="ecg-stat-lbl">QT ms</span>
        </div>
        <div className="ecg-stat">
          <span className="ecg-stat-val">{rrInterval}</span>
          <span className="ecg-stat-lbl">RR ms</span>
        </div>
      </div>

      <canvas ref={canvasRef} height="140" />
    </div>
  )
}