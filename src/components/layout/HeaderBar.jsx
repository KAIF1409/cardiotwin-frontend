/**
 * HeaderBar.jsx — professional status bar
 * ────────────────────────────────────────
 * • CardioTwin-X brand mark
 * • Live/Offline WebSocket badge
 * • Global BPM meter (engine-driven, animated pulse dot)
 * • Normal ⇄ Higher mode switch (no grade mentions — B2B product)
 * • Live EF / BP readouts
 */

import { useEffect, useState } from 'react'
import { Heart, Activity, Gauge, Maximize2, Minimize2 } from 'lucide-react'
import { subscribeConnectionState } from '../../services/apiService'
import { subscribeEngineState } from '../../simulation/cardiacEngine'

const CONN_META = {
  online_ws: { label: 'LIVE', tone: 'live', tip: 'WebSocket streaming @10 Hz' },
  online_poll: { label: 'HTTP', tone: 'poll', tip: 'Backend reachable — HTTP polling fallback' },
  connecting: { label: 'SYNC…', tone: 'wait', tip: 'Establishing connection…' },
  offline: {
    label: 'OFFLINE',
    tone: 'off',
    tip: 'Backend unreachable — running local physics model'
  }
}

export default function HeaderBar({
  appMode,
  onModeChange,
  sysBP,
  diaBP,
  fullscreenOn,
  onToggleFullscreen
}) {
  const [conn, setConn] = useState('connecting')
  const [meter, setMeter] = useState({ bpm: 75, phase: 0, ef: 60 })

  useEffect(() => subscribeConnectionState(setConn), [])
  useEffect(
    () => subscribeEngineState(s => setMeter({ bpm: s.bpm, phase: s.phase, ef: s.ef }), 12),
    []
  )

  const meta = CONN_META[conn] ?? CONN_META.connecting
  const systolic = meter.phase >= 0.14 && meter.phase < 0.46

  return (
    <header className="header">
      {/* Brand */}
      <div className="brand" title="CardioTwin-X — Real-time Cardiac Digital Twin">
        <Heart size={20} className="brand-icon" strokeWidth={1.5} />
        <span className="brand-name">
          CardioTwin<em>‑X</em>
        </span>
        <span className="brand-tag">CARDIAC EDUCATION PLATFORM</span>
      </div>

      {/* Center meters */}
      <div className="header-meters">
        <div className={`bpm-meter ${systolic ? 'systolic' : ''}`} title="Global heart rate">
          <span className="bpm-pulse-dot" />
          <span className="bpm-value">{meter.bpm}</span>
          <span className="bpm-unit">BPM</span>
          <span className="bpm-phase">{systolic ? 'SYSTOLE' : 'DIASTOLE'}</span>
        </div>

        <div className="bp-chip" title="Arterial pressure estimate">
          <span className="bp-val">
            {sysBP}
            <i>/</i>
            {diaBP}
          </span>
          <span className="bp-lbl">mmHg</span>
        </div>

        <div className="ef-chip" title="Ejection fraction">
          <span className="bp-val">{meter.ef}%</span>
          <span className="bp-lbl">EF</span>
        </div>
      </div>

      {/* Right cluster */}
      <div className="header-actions">
        <span className={`conn-badge conn-${meta.tone}`} title={meta.tip} data-tip={meta.tip}>
          <i className="conn-dot" />
          {meta.label}
        </span>

        <div className="mode-switch" role="tablist" aria-label="App mode">
          <button
            role="tab"
            aria-selected={appMode === 'normal'}
            className={appMode === 'normal' ? 'active' : ''}
            onClick={() => onModeChange('normal')}
            title="Standard view — essential anatomy, blood flow, basic hemodynamics"
          >
            <Gauge size={14} strokeWidth={1.5} />
            <span>Normal</span>
          </button>
          <button
            role="tab"
            aria-selected={appMode === 'higher'}
            className={appMode === 'higher' ? 'active' : ''}
            onClick={() => onModeChange('higher')}
            title="Advanced view — strain heatmap, conduction system, valve detail, clinical metadata"
          >
            <Activity size={14} strokeWidth={1.5} />
            <span>Higher</span>
          </button>
        </div>

        <button
          className={`fs-btn ${fullscreenOn ? 'active' : ''}`}
          onClick={onToggleFullscreen}
          title={fullscreenOn ? 'Exit fullscreen' : 'Immersive fullscreen (Esc to exit)'}
          aria-label="Toggle immersive fullscreen"
        >
          {fullscreenOn ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          <span>{fullscreenOn ? 'Exit' : 'Fullscreen'}</span>
        </button>
      </div>
    </header>
  )
}
