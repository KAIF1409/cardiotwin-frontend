/**
 * ViewportToolbar.jsx — floating minimal glass toolbar on the 3D stage
 *
 * Icons from lucide-react — open source (ISC license).
 */

import { useEffect, useRef, useState } from 'react'
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Scissors,
  ThermometerSun,
  Droplets,
  Eye,
  Speaker,
  Monitor,
  Tag,
  Layers,
  Target,
  HeartPulse,
  Wind,
  Activity,
  Crosshair
} from 'lucide-react'

const LAYER_ITEMS = [
  { key: 'skeleton', label: 'Skeleton', Icon: Layers },
  { key: 'pericardium', label: 'Pericardium', Icon: Layers },
  { key: 'myocardium', label: 'Myocardium', Icon: HeartPulse },
  { key: 'chambers', label: 'Chambers', Icon: Eye },
  { key: 'valves', label: 'Valves', Icon: Wind },
  { key: 'arteries', label: 'Arteries', Icon: Activity },
  { key: 'veins', label: 'Veins', Icon: Droplets },
  { key: 'conduction', label: 'Conduction', Icon: Layers }
]

export default function ViewportToolbar({
  onZoomIn,
  onZoomOut,
  onResetView,
  sliceActive,
  onToggleSlice,
  strainActive,
  onToggleStrain,
  flowOn,
  onToggleFlow,
  thoraxOn,
  onToggleThorax,
  labelsOn = false,
  onToggleLabels,
  soundOn = false,
  onToggleSound,
  hudOn = false,
  onToggleHud,
  layers = {},
  onSetLayer,
  focusTargets,
  onFocus,
  activeFocus,
  anatomyOn = false,
  onAnatomy,
  anatomyLabel,
  focusActive = false,
  onToggleFocus
}) {
  const [layersOpen, setLayersOpen] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false) // collapsed by default — never blocks the heart
  const popRef = useRef(null)
  const focusRef = useRef(null)

  useEffect(() => {
    if (!layersOpen && !focusOpen) return
    const onDown = e => {
      if (layersOpen && popRef.current && !popRef.current.contains(e.target)) setLayersOpen(false)
      if (focusOpen && focusRef.current && !focusRef.current.contains(e.target)) setFocusOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [layersOpen, focusOpen])

  return (
    <div className="viewport-toolbar" role="toolbar" aria-label="Viewport controls">
      <div className="vt-group" role="group" aria-label="Camera controls">
        <button className="vt-btn" onClick={onZoomIn} title="Zoom in">
          <ZoomIn size={16} strokeWidth={1.5} />
        </button>
        <button className="vt-btn" onClick={onZoomOut} title="Zoom out">
          <ZoomOut size={16} strokeWidth={1.5} />
        </button>
        <button className="vt-btn" onClick={onResetView} title="Reset camera">
          <RotateCcw size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className="vt-divider" />

      <div className="vt-group" role="group" aria-label="View modes">
        <button
          className={`vt-btn ${sliceActive ? 'active' : ''}`}
          onClick={onToggleSlice}
          title="Slicing plane (coronary cut)"
          aria-pressed={sliceActive}
        >
          <Scissors size={16} strokeWidth={1.5} />
        </button>

        <button
          className={`vt-btn ${strainActive ? 'active' : ''}`}
          onClick={onToggleStrain}
          title="Strain heatmap view"
          aria-pressed={strainActive}
        >
          <ThermometerSun size={16} strokeWidth={1.5} />
        </button>

        <button
          className={`vt-btn flow ${flowOn ? 'on' : ''}`}
          onClick={onToggleFlow}
          title={flowOn ? 'Hide blood-flow vectors' : 'Show blood-flow vectors'}
          aria-pressed={flowOn}
        >
          <Wind size={16} strokeWidth={1.5} />
        </button>

        <button
          className={`vt-btn ${thoraxOn ? 'active' : ''}`}
          onClick={onToggleThorax}
          title="Thoracic skeleton frame"
          aria-pressed={thoraxOn}
        >
          <Layers size={16} strokeWidth={1.5} />
        </button>

        <button
          className={`vt-btn vt-sound ${soundOn ? 'active sound-on' : ''}`}
          onClick={onToggleSound}
          title={
            soundOn
              ? 'Mute heart sounds'
              : 'Listen to heart sounds (S1·S2 — murmurs when valves narrow)'
          }
          aria-pressed={soundOn}
        >
          <Speaker size={16} strokeWidth={1.5} />
        </button>

        <button
          className={`vt-btn vt-hud ${hudOn ? 'active' : ''}`}
          onClick={onToggleHud}
          title={
            hudOn
              ? 'Exit Projector/HUD mode'
              : 'Projector/HUD mode — full-screen classroom projection with 2× labels'
          }
          aria-pressed={hudOn}
        >
          <Monitor size={16} strokeWidth={1.5} />
        </button>

        <button
          className={`vt-btn vt-labels ${labelsOn ? 'active' : ''}`}
          onClick={onToggleLabels}
          title={labelsOn ? 'Hide anatomical labels' : 'Show anatomical labels'}
          aria-pressed={labelsOn}
        >
          <Tag size={16} strokeWidth={1.5} />
        </button>

        <button
          className={`vt-btn ${anatomyOn ? 'active' : ''}`}
          onClick={onAnatomy}
          title={
            anatomyOn
              ? `Return to heart (viewing ${anatomyLabel})`
              : 'Replace heart with selected anatomy'
          }
          aria-pressed={anatomyOn}
        >
          <Target size={16} strokeWidth={1.5} />
          {anatomyOn && <span className="vt-btn-txt">{anatomyLabel}</span>}
        </button>

        <button
          className={`vt-btn vt-focus ${focusActive ? 'active' : ''}`}
          onClick={onToggleFocus}
          title={
            focusActive
              ? 'Exit focus view (Esc) — panels return'
              : 'Focus view — clears every panel for an unobstructed model'
          }
          aria-pressed={focusActive}
        >
          <Crosshair size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className="vt-divider" />

      <div className="vt-layers-wrap" ref={popRef}>
        <button
          className={`vt-btn ${layersOpen ? 'active' : ''}`}
          onClick={() => setLayersOpen(o => !o)}
          title="Anatomical layer isolation"
          aria-expanded={layersOpen}
        >
          <Layers size={16} strokeWidth={1.5} />
        </button>
        {layersOpen && (
          <div className="layers-pop glass-pop" role="menu" aria-label="Anatomical layers">
            <div className="layers-pop-head">ANATOMICAL LAYERS</div>
            {LAYER_ITEMS.map(item => (
              <label key={item.key} className="layer-row" data-on={!!layers[item.key]}>
                <input
                  type="checkbox"
                  checked={!!layers[item.key]}
                  onChange={() => onSetLayer?.(item.key)}
                />
                <span className="layer-ico">
                  <item.Icon size={14} strokeWidth={1.5} />
                </span>
                <span className="layer-name">{item.label}</span>
                <span className="layer-tick">{layers[item.key] ? 'ON' : 'OFF'}</span>
              </label>
            ))}
            <div className="layers-pop-foot">Inner chambers auto-clear the myocardial wall</div>
          </div>
        )}
      </div>

      {focusTargets && focusTargets.length > 0 && (
        <div className="vt-focus-wrap" ref={focusRef}>
          <button
            className={`vt-btn ${focusOpen ? 'active' : ''}`}
            onClick={() => setFocusOpen(o => !o)}
            title="Focus anatomy — glide camera to a structure"
            aria-expanded={focusOpen}
          >
            <Crosshair size={16} strokeWidth={1.5} />
          </button>
          {focusOpen && (
            <div className="layers-pop glass-pop focus-pop" role="menu" aria-label="Focus anatomy">
              <div className="layers-pop-head">FOCUS ANATOMY</div>
              <div className="focus-grid">
                {focusTargets.map(t => (
                  <button
                    key={t.id}
                    className={`vt-chip ${activeFocus === t.id ? 'active' : ''}`}
                    style={{ '--chip': t.color }}
                    onClick={() => {
                      onFocus(t)
                      setFocusOpen(false)
                    }}
                    title={`${t.fullName} — ${t.desc}`}
                  >
                    {t.id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
