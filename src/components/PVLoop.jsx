/**
 * PVLoop.jsx
 * ==========
 * Pressure-Volume loop chart.  Shows real backend data when the WebSocket
 * is live, or a physics-parameterized mock loop when offline.
 *
 * BUG FIX (ownerDocument null crash):
 *   Same root cause as ECGGraph — Chart.js calls getComputedStyle() on the
 *   canvas element during construction to bind its ResizeObserver.  If the
 *   <canvas> is not yet attached to the DOM (canvasRef.current === null),
 *   this throws "Cannot read properties of null (reading 'ownerDocument')".
 *
 *   Fix: guard with `if (!canvasRef.current) return` before new Chart().
 *
 * Place this file at:  src/components/PVLoop.jsx
 */

import { useEffect, useRef, useState } from 'react'
import {
  Chart, ScatterController, LineElement, PointElement, LinearScale, Tooltip,
} from 'chart.js'
import { fetchSimulateCycle, subscribeHeartData } from '../services/apiService'

Chart.register(ScatterController, LineElement, PointElement, LinearScale, Tooltip)

function generateMockPVLoop(preload, afterload, infarct, valve, ef) {
  const edv  = 100 + preload * 0.8
  const esv  = 40 + afterload * 0.4 + infarct * 0.3
  const maxP = (60 + afterload * 0.9) * (valve / 100)
  const minP = 5 + preload * 0.1

  const isHeartFailure = ef < 40 || infarct > 30
  const isStenosis     = valve < 60
  const isAthlete      = ef > 65 && afterload < 40

  let xScale  = (edv - esv) / 2
  let yScale  = (maxP - minP) / 2
  let xCenter = (edv + esv) / 2
  let yCenter = (maxP + minP) / 2

  if (isHeartFailure)  { xScale *= 0.55; xCenter += 20; yScale *= 0.7  }
  else if (isStenosis) { yScale *= 1.3;  xScale  *= 0.75; yCenter += 10 }
  else if (isAthlete)  { xScale *= 1.2;  yScale  *= 1.1                 }

  return Array.from({ length: 37 }, (_, i) => {
    const angle = (i / 36) * 2 * Math.PI
    return {
      x: Math.round(xCenter + xScale * Math.cos(angle)),
      y: Math.round(yCenter + yScale * Math.sin(angle)),
    }
  })
}

function getLoopColor(ef, infarct, valve) {
  if (ef < 40 || infarct > 30) return { border: '#ef5350', label: '❤️‍🩹 Heart Failure Loop' }
  if (valve < 60)               return { border: '#ff9800', label: '⚠️ Stenosis Loop'        }
  if (ef > 65)                  return { border: '#00bcd4', label: '⚡ Athlete Loop'          }
  return                               { border: '#ab47bc', label: '✅ Normal Loop'           }
}

// Rolling buffer for live V/P trace
const LIVE_BUFFER = 60

export default function PVLoop({
  preload = 50, afterload = 50, heartRate = 75,
  beat, infarct = 0, valve = 100, ef = 55, mockOverride = false, presetKey = 0,
}) {
  const canvasRef   = useRef(null)
  const chartRef    = useRef(null)
  const dotIndexRef = useRef(0)
  const intervalRef = useRef(null)
  const realLoopRef = useRef(null)
  const liveVBuf    = useRef([])
  const livePBuf    = useRef([])
  const [usingReal, setUsingReal] = useState(false)
  const [liveStats, setLiveStats] = useState(null)

  const { border, label } = getLoopColor(ef, infarct, valve)

  // Derived mock numeric badges (shown when offline)
  const mockEdv  = Math.round(100 + preload * 0.8)
  const mockEsv  = Math.round(40 + afterload * 0.4 + infarct * 0.3)
  const mockSv   = Math.max(0, mockEdv - mockEsv)
  const mockEf   = Math.round((mockSv / mockEdv) * 100)
  const mockMaxP = Math.round((60 + afterload * 0.9) * (valve / 100))

  const displayEdv  = liveStats?.edv  ?? mockEdv
  const displayEsv  = liveStats?.esv  ?? mockEsv
  const displaySv   = liveStats?.sv   ?? mockSv
  const displayEf   = liveStats?.ef   ?? mockEf
  const displayMaxP = liveStats?.sbp  ?? mockMaxP

  // ── Chart initialisation ────────────────────────────────────────────────
  useEffect(() => {
    // BUG FIX: canvasRef.current is null when this effect fires before the
    // canvas element is mounted.  Chart.js needs an attached DOM node to
    // bind ResizeObserver — guard here to avoid the ownerDocument crash.
    if (!canvasRef.current) return

    const mockLoop = generateMockPVLoop(preload, afterload, infarct, valve, ef)

    chartRef.current = new Chart(canvasRef.current, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label:           'Loop',
            data:            mockLoop,
            borderColor:     border + '55',
            backgroundColor: 'transparent',
            borderWidth:     2,
            pointRadius:     0,
            showLine:        true,
            tension:         0.4,
          },
          {
            label:           'Cursor',
            data:            [mockLoop[0]],
            borderColor:     border,
            backgroundColor: border,
            pointRadius:     7,
            showLine:        false,
          },
        ],
      },
      options: {
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled:         true,
            backgroundColor: '#0d0d1f',
            borderColor:     border,
            borderWidth:     1,
            callbacks: {
              label: (ctx) =>
                ` Vol: ${ctx.parsed.x.toFixed(1)} ml  |  P: ${ctx.parsed.y.toFixed(1)} mmHg`,
            },
          },
        },
        scales: {
          x: {
            min:   0,
            max:   280,
            title: { display: true, text: 'Volume (ml)',     color: '#888', font: { size: 10, weight: '600' } },
            ticks: { color: '#888', font: { size: 10 }, maxTicksLimit: 7 },
            grid:  { color: 'rgba(171,71,188,0.07)' },
          },
          y: {
            min:   0,
            max:   200,
            title: { display: true, text: 'Pressure (mmHg)', color: '#888', font: { size: 10, weight: '600' } },
            ticks: { color: '#888', font: { size: 10 }, maxTicksLimit: 6 },
            grid:  { color: 'rgba(171,71,188,0.07)' },
          },
        },
      },
    })

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Live WebSocket V/P streaming ─────────────────────────────────────────
  // Skip when mockOverride=true (FlashcardDeck / ECGQuiz driving the view)
  useEffect(() => {
    if (mockOverride) {
      // Revert to mock loop immediately
      setUsingReal(false)
      liveVBuf.current = []
      livePBuf.current = []
      realLoopRef.current = null
      setLiveStats(null)
      if (chartRef.current) {
        const mockLoop = generateMockPVLoop(preload, afterload, infarct, valve, ef)
        chartRef.current.data.datasets[0].data            = mockLoop
        chartRef.current.data.datasets[0].borderColor     = border + '55'
        chartRef.current.data.datasets[1].borderColor     = border
        chartRef.current.data.datasets[1].backgroundColor = border
        chartRef.current.update('none')
      }
      return
    }
    const unsub = subscribeHeartData((data) => {
      if (!chartRef.current) return

      // Backend went offline — revert to mock
      if (!data) {
        setUsingReal(false)
        liveVBuf.current = []
        livePBuf.current = []
        setLiveStats(null)
        const mockLoop = generateMockPVLoop(preload, afterload, infarct, valve, ef)
        chartRef.current.data.datasets[0].data            = mockLoop
        chartRef.current.data.datasets[0].borderColor     = border + '55'
        chartRef.current.data.datasets[1].borderColor     = border
        chartRef.current.data.datasets[1].backgroundColor = border
        chartRef.current.update('none')
        return
      }

      if (data.volume == null || data.pressure == null) return

      setLiveStats({ edv: data.edv, esv: data.esv, sv: data.sv, ef: data.ef, sbp: data.sbp })

      liveVBuf.current.push(parseFloat(data.volume))
      livePBuf.current.push(parseFloat(data.pressure))
      if (liveVBuf.current.length > LIVE_BUFFER) {
        liveVBuf.current.shift()
        livePBuf.current.shift()
      }

      if (liveVBuf.current.length < 5) return

      const points = liveVBuf.current.map((v, i) => ({
        x: parseFloat(v.toFixed(2)),
        y: parseFloat(livePBuf.current[i].toFixed(2)),
      }))

      realLoopRef.current = points
      chartRef.current.data.datasets[0].data            = points
      chartRef.current.data.datasets[0].borderColor     = '#00ff8855'
      chartRef.current.data.datasets[1].borderColor     = '#00ff88'
      chartRef.current.data.datasets[1].backgroundColor = '#00ff88'
      chartRef.current.update('none')
      setUsingReal(true)
    })
    return () => unsub?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preload, afterload, infarct, valve, ef, border, mockOverride])

  // PRESET CHANGE FIX: when presetKey changes (user clicked a disease preset),
  // force full reset of real loop data and revert to mock so the PV loop
  // shape immediately reflects the new disease state — even when backend is live.
  useEffect(() => {
    if (presetKey === 0) return   // skip initial mount
    setUsingReal(false)
    liveVBuf.current    = []
    livePBuf.current    = []
    realLoopRef.current = null
    dotIndexRef.current = 0
    setLiveStats(null)
    if (chartRef.current) {
      const newLoop = generateMockPVLoop(preload, afterload, infarct, valve, ef)
      chartRef.current.data.datasets[0].data            = newLoop
      chartRef.current.data.datasets[0].borderColor     = border + '55'
      chartRef.current.data.datasets[1].borderColor     = border
      chartRef.current.data.datasets[1].backgroundColor = border
      chartRef.current.update('none')
    }
  }, [presetKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mock loop update on param changes (offline only) ─────────────────────
  // BUG FIX: also clear realLoopRef when params change in offline mode.
  // Without this, the cursor animation keeps using the old fetched loop
  // shape even though the chart visually shows the new mock loop.
  useEffect(() => {
    if (!chartRef.current || usingReal) return
    realLoopRef.current = null // force cursor animation to use fresh mock loop
    const newLoop = generateMockPVLoop(preload, afterload, infarct, valve, ef)
    chartRef.current.data.datasets[0].data            = newLoop
    chartRef.current.data.datasets[0].borderColor     = border + '55'
    chartRef.current.data.datasets[1].borderColor     = border
    chartRef.current.data.datasets[1].backgroundColor = border
    chartRef.current.update('none')
  }, [preload, afterload, infarct, valve, ef, border, usingReal])

  // ── /simulate_cycle fetch on preset change or startup ────────────────────
  // Fetches on presetKey change (disease preset selected) so PV loop shape
  // updates from backend physics immediately. usingReal guard removed so
  // preset changes always get fresh loop data even when backend is live.
  useEffect(() => {
    if (mockOverride) return
    const snapshotEf = ef, snapshotInfarct = infarct, snapshotKey = presetKey
    fetchSimulateCycle().then(data => {
      if (ef !== snapshotEf || infarct !== snapshotInfarct || presetKey !== snapshotKey) return
      if (!data?.volume || !data?.pressure || !chartRef.current) return
      if (data.volume.length === 0) return
      const points = data.volume.map((v, i) => ({
        x: parseFloat(v),
        y: parseFloat(data.pressure[i]),
      }))
      realLoopRef.current = points
      dotIndexRef.current = 0
      chartRef.current.data.datasets[0].data            = points
      chartRef.current.data.datasets[0].borderColor     = '#00ff8855'
      chartRef.current.data.datasets[1].borderColor     = '#00ff88'
      chartRef.current.data.datasets[1].backgroundColor = '#00ff88'
      chartRef.current.update('none')
      setUsingReal(true)
    }).catch(() => {})
  }, [ef, infarct, valve, preload, afterload, presetKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Animate cursor dot ────────────────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const loop  = realLoopRef.current || generateMockPVLoop(preload, afterload, infarct, valve, ef)
    const speed = Math.round((60 / heartRate) * 1000 / loop.length)
    intervalRef.current = setInterval(() => {
      if (!chartRef.current) return
      const activeLoop = realLoopRef.current || generateMockPVLoop(preload, afterload, infarct, valve, ef)
      dotIndexRef.current = (dotIndexRef.current + 1) % activeLoop.length
      chartRef.current.data.datasets[1].data = [activeLoop[dotIndexRef.current]]
      chartRef.current.update('none')
    }, speed)
    return () => clearInterval(intervalRef.current)
  }, [heartRate, preload, afterload, infarct, valve, ef])

  useEffect(() => { if (beat) dotIndexRef.current = 0 }, [beat])

  return (
    <div>
      <div className="graph-title" style={{ color: usingReal ? '#00ff88' : border }}>
        🔄 PV Loop
        {usingReal && <span className="graph-live-badge">Live</span>}
      </div>
      <p className="graph-sub">{label}</p>

      <div className="pv-stats-row">
        <div className="pv-stat">
          <span className="pv-stat-val" style={{ color: '#00bcd4' }}>{displayEdv}</span>
          <span className="pv-stat-lbl">EDV ml</span>
        </div>
        <div className="pv-stat">
          <span className="pv-stat-val" style={{ color: '#ff9800' }}>{displayEsv}</span>
          <span className="pv-stat-lbl">ESV ml</span>
        </div>
        <div className="pv-stat">
          <span className="pv-stat-val" style={{ color: '#ab47bc' }}>{displaySv}</span>
          <span className="pv-stat-lbl">SV ml</span>
        </div>
        <div className="pv-stat">
          <span className="pv-stat-val" style={{
            color: displayEf >= 55 ? '#ab47bc' : displayEf >= 40 ? '#ff9800' : '#ef5350',
          }}>
            {displayEf}%
          </span>
          <span className="pv-stat-lbl">EF</span>
        </div>
        <div className="pv-stat">
          <span className="pv-stat-val" style={{ color: '#ef5350' }}>{displayMaxP}</span>
          <span className="pv-stat-lbl">Peak P</span>
        </div>
      </div>

      <canvas ref={canvasRef} height="160" />
    </div>
  )
}