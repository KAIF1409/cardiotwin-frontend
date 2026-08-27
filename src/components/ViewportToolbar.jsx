/**
 * ViewportToolbar.jsx — floating minimal glass toolbar on the 3D stage
 * ─────────────────────────────────────────────────────────────────────
 * Zoom ± · Reset camera · Slicing plane toggle · Strain heatmap toggle ·
 * Blood-flow particles toggle · Anatomical focus chips (LV RV LA RA AO).
 * All actions are imperative (camera refs / engine flags) — no re-render
 * of the Canvas tree.
 */

export default function ViewportToolbar({
  onZoomIn, onZoomOut, onResetView,
  sliceActive, onToggleSlice,
  strainActive, onToggleStrain,
  flowOn, onToggleFlow,
  thoraxOn, onToggleThorax,
  focusTargets, onFocus, activeFocus,
}) {
  return (
    <div className="viewport-toolbar">
      <div className="vt-group" role="group" aria-label="Camera controls">
        <button className="vt-btn" onClick={onZoomIn}  title="Zoom in"><span>＋</span></button>
        <button className="vt-btn" onClick={onZoomOut} title="Zoom out"><span>－</span></button>
        <button className="vt-btn" onClick={onResetView} title="Reset camera">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M3 12a9 9 0 1 0 3-6.7" strokeLinecap="round"/>
            <path d="M3 4v5h5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className="vt-divider" />

      <div className="vt-group" role="group" aria-label="View modes">
        <button
          className={`vt-btn ${sliceActive ? 'active' : ''}`}
          onClick={onToggleSlice}
          title="Slicing plane (coronary cut)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 15l9 6 9-6M3 9l9 6 9-6-9-6-9 6z" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          className={`vt-btn ${strainActive ? 'active' : ''}`}
          onClick={onToggleStrain}
          title="Strain heatmap view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 3v18M5 8c2.5 0 4.5 1.8 4.5 4S7.5 16 5 16s-2-1.6-2-4 .5-4 2-4zm14 0c-2.5 0-4.5 1.8-4.5 4s2 4 4.5 4 2-1.6 2-4-.5-4-2-4z" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          className={`vt-btn ${flowOn ? 'flow-on' : ''} ${flowOn ? 'active' : ''}`}
          onClick={onToggleFlow}
          title="Blood flow particles"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M3 12h11M17 12l-3-3m3 3l-3 3" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="20.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>
          </svg>
        </button>
        <button
          className={`vt-btn ${thoraxOn ? 'active' : ''}`}
          onClick={onToggleThorax}
          title="Thoracic skeleton frame"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 4c-2 2.5-2.5 7-1.5 11S8 21 9 19s0-5-.5-8S7 5 6 4z" strokeLinejoin="round"/>
            <path d="M18 4c2 2.5 2.5 7 1.5 11S16 21 15 19s0-5 .5-8S17 5 18 4z" strokeLinejoin="round"/>
            <path d="M10 5v13m4-13v13" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="vt-divider" />

      {/* Anatomical focus chips — click to glide camera */}
      {focusTargets && (
        <div className="vt-focus-row" role="group" aria-label="Focus anatomy">
          {focusTargets.map(t => (
            <button
              key={t.id}
              className={`vt-chip ${activeFocus === t.id ? 'active' : ''}`}
              style={{ '--chip': t.color }}
              onClick={() => onFocus(t)}
              title={`${t.fullName} — ${t.desc}`}
            >
              {t.id}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
