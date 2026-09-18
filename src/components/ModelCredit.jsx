/**
 * ModelCredit.jsx — third-party licence notice, collapsed by default.
 * ─────────────────────────────────────────────────────────────────────
 * Renders as a 20px chip in the bottom-left corner. Nothing sits on the
 * model axis, so the heart is never occluded by legal text.
 * The full notice mounts only after an explicit click.
 * Text is deliberately small (10px) and low-contrast — present and
 * readable, but never competing with the telemetry.
 */

import { useState, useEffect } from 'react'
import { Info, X } from 'lucide-react'

export default function ModelCredit() {
  const [open, setOpen] = useState(false)

  // Escape closes the notice
  useEffect(() => {
    if (!open) return
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="credit-dock">
      {open && (
        <div className="credit-card" role="note" aria-label="Model attribution">
          <div className="credit-head">
            <span>Model attribution</span>
            <button
              type="button"
              className="credit-x"
              onClick={() => setOpen(false)}
              aria-label="Close attribution"
            >
              <X size={13} strokeWidth={2.25} />
            </button>
          </div>
          <p className="credit-body">
            Cardiac mesh — <strong>“Realistic Human Heart”</strong> by neshallads, published on
            Sketchfab. Licence <strong>CC BY 4.0</strong>. Region meshes derive from the in-project
            cardiac segmentation set.
          </p>
          <p className="credit-body">
            Research and teaching use only. Not a diagnostic device; outputs are simulation
            estimates, not patient measurements.
          </p>
        </div>
      )}

      <button
        type="button"
        className="credit-chip"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title="Open-source model attribution"
      >
        <Info size={13} strokeWidth={2} />
        <span>Attribution</span>
      </button>
    </div>
  )
}
