/**
 * PVLoop.jsx  —  v2 (MASTER CLOCK EDITION)
 * ════════════════════════════════════════
 * Pressure–Volume loop drawn on raw canvas, driven by the master engine.
 *
 * The loop is a TRUE physiological shape — not an ellipse:
 *   ⬤ isovolumetric contraction  (vertical rise at EDV)
 *   ⬤ ejection                   (top edge, volume ↓)
 *   ⬤ isovolumetric relaxation   (vertical fall at ESV)
 *   ⬤ filling                    (bottom edge, E-wave + A-wave)
 *
 * The bright cursor dot sits exactly at the current engine phase, so it
 * reaches peak systolic pressure precisely when the ECG R-wave peaks and
 * the 3-D mesh is maximally contracted.
 */

import { useEffect, useRef, useState } from 'react'
import {
  getEngineState, sampleCycle,
} from '../simulation/cardiacEngine'
import { fetchSimulateCycle } from '../services/apiService'

export default function PVLoop({
  preload = 50, afterload = 50, heartRate = 75,
  infarct = 0, valve = 100, ef = 55, height = 170,
}) {
  const canvasRef = useRef(null)
  const wrapRef   = useRef(null)
  const traceRef  = useRef(null)     // [{v,p}] from engine sampleCycle
  const liveTraceRef = useRef(null)  // backend /simulate_cycle overlay
  const [liveOk, setLiveOk]   = useState(false)

  // ── Rebuild the static trace whenever parameters change ──────────────────
  useEffect(() => {
    traceRef.current = sampleCycle(140).map(s => ({ v: s.volume, p: s.lvPressure }))
  }, [preload, afterload, infarct, valve, ef])

  // ── Backend real-loop overlay (kept from v1) ─────────────────────────────
  useEffect(() => {
    let cancelled = false
    fetchSimulateCycle().then(data => {
      if (cancelled) return
      if (!data?.volume || !data?.pressure || data.volume.length === 0) return
      liveTraceRef.current = data.volume.map((v, i) => ({
        v: parseFloat(v),
        p: parseFloat(data.pressure?.[i] ?? 0),
      }))
      setLiveOk(true)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [preload, afterload, infarct, valve])


  // ── Render loop (engine-locked) ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap   = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let raf = null

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      if (!rect.width) return
      canvas.width  = Math.max(50, Math.floor(rect.width * dpr))
      canvas.height = Math.floor(height * dpr)
      canvas.style.width  = '100%'
      canvas.style.height = height + 'px'
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const render = () => {
      raf = requestAnimationFrame(render)
      const s = getEngineState()
      const w = canvas.width, h = canvas.height
      if (!w || !h) return

      const padL = 34 * dpr, padR = 10 * dpr, padT = 10 * dpr, padB = 20 * dpr
      const plotW = w - padL - padR, plotH = h - padT - padB

      // Axis ranges — stable per params, with headroom
      const trace  = traceRef.current
      let maxV = 180, maxP = 200
      if (trace && trace.length) {
        maxV = Math.max(...trace.map(d => d.v)) * 1.15 + 1
        maxP = Math.max(...trace.map(d => d.p)) * 1.25 + 5
      }

      const X = v => padL + (v / maxV) * plotW
      const Y = p => padT + plotH - (p / maxP) * plotH

      ctx.clearRect(0, 0, w, h)

      // grid
      ctx.strokeStyle = 'rgba(0,242,254,0.06)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i <= 5; i++) {
        const gx = padL + (plotW / 5) * i; ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + plotH)
        const gy = padT + (plotH / 5) * i; ctx.moveTo(padL, gy); ctx.lineTo(padL + plotW, gy)
      }
      ctx.stroke()

      // axes labels
      ctx.fillStyle = 'rgba(232,236,246,0.45)'
      ctx.font = `${9 * dpr}px Inter, sans-serif`

      // ── Backend live overlay (dim emerald, dashed) ──
      if (liveTraceRef.current && s.live) {
        ctx.strokeStyle = 'rgba(16,185,129,0.35)'
        ctx.lineWidth = 1.5 * dpr
        ctx.setLineDash([4 * dpr, 3 * dpr])
        ctx.beginPath()
        liveTraceRef.current.forEach((d, i) => {
          const x = X(Math.min(d.v, maxV)), y = Y(Math.min(Math.max(d.p, 0), maxP))
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.stroke()
        ctx.setLineDash([])
      }

      // ── Engine loop trace (cyan glow) ──
      if (trace && trace.length) {
        ctx.strokeStyle = '#00F2FE'
        ctx.lineWidth = 2.2 * dpr
        ctx.shadowColor = '#00F2FE'
        ctx.shadowBlur = 8
        ctx.beginPath()
        trace.forEach((d, i) => {
          const x = X(d.v), y = Y(d.p)
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.stroke()
        ctx.shadowBlur = 0

        // phase markers: end of isovol contraction & end of ejection
        const markIdx = [28, 64]   // ≈ phase 0.20 & 0.46 across 140 samples
        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        markIdx.forEach(i => {
          const d = trace[i % trace.length]
          ctx.beginPath(); ctx.arc(X(d.v), Y(d.p), 2 * dpr, 0, Math.PI * 2); ctx.fill()
        })
      }

      // ── Cursor dot at CURRENT engine phase ──
      const cx = X(Math.min(s.lvVolume, maxV))
      const cy = Y(Math.min(Math.max(s.lvPressure, 0), maxP))
      const systolic = s.phase >= 0.14 && s.phase < 0.46
      const col = systolic ? '#FF2E93' : '#10B981'   // magenta=systole, emerald=diastole

      ctx.shadowColor = col
      ctx.shadowBlur = 14
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(cx, cy, 4.5 * dpr, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 1.2 * dpr
      ctx.stroke()
    }

    raf = requestAnimationFrame(render)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [height])

  // numeric badges — pure param math (mirrors engine.computeVolumes)
  const edv   = Math.round(70 + preload * 0.9)
  const esv   = Math.round(edv * (1 - ef / 100))
  const sv    = Math.max(0, edv - esv)
  const peakP = Math.round(
    ((55 + afterload * 0.55) * (1 + ef / 250)) * (valve / 100) +
    Math.max(0, 100 - valve) * 0.45
  )

  return (
    <div className="pv-graph">
      <div className="graph-head">
        <span className="graph-title"><span className="graph-ic">🔄</span>PV Loop</span>
        <span className={`graph-badge ${liveOk ? 'graph-badge-live' : ''}`}>{liveOk ? 'LIVE' : 'MODEL'}</span>
      </div>
      <div className="ecg-canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} />
      </div>
      <div className="pv-stats-row">
        <div className="pv-stat"><span className="pv-stat-val pv-cyan">{edv}</span><span className="pv-stat-lbl">EDV ml</span></div>
        <div className="pv-stat"><span className="pv-stat-val pv-orange">{esv}</span><span className="pv-stat-lbl">ESV ml</span></div>
        <div className="pv-stat"><span className="pv-stat-val pv-magenta">{sv}</span><span className="pv-stat-lbl">SV ml</span></div>
        <div className="pv-stat">
          <span className="pv-stat-val" data-tone={ef >= 55 ? 'good' : ef >= 40 ? 'warn' : 'bad'}>{ef}%</span>
          <span className="pv-stat-lbl">EF</span>
        </div>
        <div className="pv-stat"><span className="pv-stat-val pv-red">{peakP}</span><span className="pv-stat-lbl">Peak P</span></div>
      </div>
    </div>
  )
}
