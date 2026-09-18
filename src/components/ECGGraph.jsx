/**
 * ECGGraph.jsx  —  v2 (MASTER CLOCK EDITION)
 * ══════════════════════════════════════════
 * Replaces the old Chart.js implementation.
 *
 * WHY: Chart.js needed its own setInterval sweep that drifted against the
 * 3-D mesh clock; it also crashed with "ownerDocument of null"when the
 * canvas mounted detached.  This renderer draws on a raw <canvas> driven
 * by the master cardiac engine's rAF loop — the trace, the QRS flash,
 * the PV-loop cursor and the mesh contraction are pixel-locked together
 * because they read the SAME phase variable.
 *
 * Features:
 *   • Scrolling ECG trace w/ ECG paper grid + glow
 *   • Live backend overlay (emerald) when WebSocket data flows
 *   • P/QRS/T region tinting for education overlays
 *   • PR / QRS / QT / RR interval chips derived from live params
 */

import { useEffect, useRef } from 'react'
import { getEngineState } from '../simulation/cardiacEngine'
import { subscribeHeartData } from '../services/apiService'

const SWEEP_PX_PER_SEC = 90 // scroll speed (CSS px / s)
const GRID_MINOR = 8
const GRID_MAJOR = 40

export default function ECGGraph({
  heartRate = 75,
  ef = 55,
  infarct = 0,
  showSegments = false,
  height = 150
}) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const bufRef = useRef({ data: new Float32Array(1024), head: 0, count: 0 })
  const liveFlashRef = useRef(0) // timestamp of last real backend sample
  const stShiftRef = useRef(0)

  // ST-elevation amount (MI visual) — ref so the render loop reads it live
  useEffect(() => {
    stShiftRef.current = infarct > 30 ? (infarct / 100) * 0.3 : 0
    // flush buffer so morphology change is instant
    const b = bufRef.current
    b.count = 0
    b.head = 0
  }, [infarct, ef, heartRate])

  // ── Subscribe to backend samples for the LIVE overlay colouring ──────────
  useEffect(
    () =>
      subscribeHeartData(data => {
        if (!data || data.ecg == null) return
        liveFlashRef.current = performance.now()
      }),
    []
  )

  // ── Engine-driven render loop ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let raf = null

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      if (!rect.width) return
      canvas.width = Math.max(50, Math.floor(rect.width * dpr))
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = '100%'
      canvas.style.height = height + 'px'
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const pushSample = v => {
      const b = bufRef.current
      b.data[b.head] = v
      b.head = (b.head + 1) % b.data.length
      if (b.count < b.data.length) b.count++
    }

    const drawGrid = (w, h) => {
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(227,0,58,0.07)'
      ctx.beginPath()
      for (let x = 0; x <= w; x += GRID_MINOR * dpr) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
      }
      for (let y = 0; y <= h; y += GRID_MINOR * dpr) {
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
      }
      ctx.stroke()
      ctx.strokeStyle = 'rgba(15,23,42,0.12)'
      ctx.beginPath()
      for (let x = 0; x <= w; x += GRID_MAJOR * dpr) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
      }
      for (let y = 0; y <= h; y += GRID_MAJOR * dpr) {
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
      }
      ctx.stroke()
    }

    let lastFrame = performance.now()
    const render = () => {
      raf = requestAnimationFrame(render)
      const now = performance.now()
      const dt = Math.min((now - lastFrame) / 1000, 0.1)
      lastFrame = now

      const s = getEngineState()

      // sample engine once per animation frame — sweep rate is real-time
      pushSample(
        s.ecg + (stShiftRef.current > 0 && s.phase > 0.2 && s.phase < 0.34 ? stShiftRef.current : 0)
      )

      const w = canvas.width,
        h = canvas.height
      if (!w || !h) return
      ctx.clearRect(0, 0, w, h)
      drawGrid(w, h)

      const mid = h * 0.6
      const amp = h * 0.42
      const pxPerSample =
        SWEEP_PX_PER_SEC * dpr * dt === 0 ? 1.5 * dpr : (SWEEP_PX_PER_SEC * dpr) / 60

      // ── Education segment tints (P / QRS / T windows scrolling by) ──
      if (showSegments) {
        const segs = [
          [0.0, 0.1, 'rgba(227,0,58,0.09)'],
          [0.14, 0.23, 'rgba(29,78,216,0.09)'],
          [0.32, 0.5, 'rgba(14,159,110,0.10)']
        ]
        segs.forEach(([a, b2, fill]) => {
          const xa = w - ((s.phase - a + 1) % 1) * w
          const xb = w - ((s.phase - b2 + 1) % 1) * w
          ctx.fillStyle = fill
          ctx.fillRect(Math.min(xa, xb), 0, Math.abs(xb - xa), h)
        })
      }

      // ── Trace ──
      const b = bufRef.current
      const n = Math.min(b.count, Math.floor(w / pxPerSample))
      const startX = w - n * pxPerSample

      ctx.lineWidth = 2 * dpr
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.strokeStyle = s.live ? '#E3003A' : '#0F172A'
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0

      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const idx = (b.head - n + i + b.data.length) % b.data.length
        const x = startX + i * pxPerSample
        const y = mid - b.data[idx] * amp
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0

      // leading dot
      const lastVal = n > 0 ? b.data[(b.head - 1 + b.data.length) % b.data.length] : 0
      ctx.fillStyle = s.live ? '#E3003A' : '#0F172A'
      ctx.beginPath()
      ctx.arc(w - 3 * dpr, mid - lastVal * amp, 3 * dpr, 0, Math.PI * 2)
      ctx.fill()
    }

    raf = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [showSegments, height])

  // ── Interval stat chips (instant from params — no timers) ─────────────────
  const prInterval = Math.round(
    120 + (heartRate < 60 ? 60 : heartRate < 70 ? 40 : heartRate > 90 ? -10 : 20)
  )
  const qrsWidth = infarct > 50 ? 160 : infarct > 30 || ef < 40 ? 130 : ef < 50 ? 110 : 85
  const qtInterval = Math.max(240, Math.round(420 - heartRate * 1.8))
  const rrInterval = Math.round(60000 / heartRate)

  const ecgLabel =
    heartRate > 150
      ? 'Ventricular Tachycardia'
      : heartRate > 100
        ? 'Sinus Tachycardia'
        : heartRate < 50
          ? 'Severe Bradycardia'
          : infarct > 50
            ? 'Infarct — Q-waves · ST↑'
            : infarct > 30
              ? 'Ischaemic Pattern'
              : ef < 30
                ? 'Severe HF Pattern'
                : ef < 40
                  ? 'Heart Failure Pattern'
                  : ef > 65
                    ? 'Hyperdynamic (Athlete)'
                    : heartRate < 60
                      ? 'Sinus Bradycardia'
                      : heartRate <= 100
                        ? 'Normal Sinus Rhythm'
                        : 'Borderline'

  return (
    <div className="ecg-graph">
      <div className="graph-head">
        <span className="graph-title">ECG</span>
        <span className="graph-badge graph-badge-bpm">{heartRate} BPM</span>
      </div>
      <div className="ecg-canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} />
        <span className="ecg-label-chip">{ecgLabel}</span>
      </div>
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
    </div>
  )
}
