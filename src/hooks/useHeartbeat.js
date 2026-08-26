/**
 * useHeartbeat.js  —  v2 (MASTER CLOCK EDITION)
 * =============================================
 * Thin React wrapper over the singleton cardiac engine
 * (src/simulation/cardiacEngine.js).
 *
 * The OLD version owned a setInterval that fired a counter — nothing else
 * in the app could know *where* inside the cardiac cycle it was, so the
 * 3D mesh, ECG, PV loop and strain gauges each ran their own drifting
 * timers.  This version delegates all timing to the engine:
 *
 *   • `phase` — continuous 0→1 position in the current cardiac cycle.
 *   • `beat`  — monotonically increasing beat counter (same contract as v1,
 *               so existing consumers keep working).
 *
 * Components that need per-frame data should NOT re-render through this
 * hook — they should register with onEngineFrame() instead.  This hook is
 * for lightweight UI (badges, meters).
 */

import { useEffect, useState } from 'react'
import {
  subscribeEngineState,
  setEngineParams,
} from '../simulation/cardiacEngine'

export default function useHeartbeat(heartRate) {
  const [{ beat, phase }, setTick] = useState({ beat: 0, phase: 0 })

  useEffect(() => {
    if (heartRate != null) {
      setEngineParams({ heartRate: Math.max(30, Math.min(200, heartRate || 75)) })
    }
  }, [heartRate])

  useEffect(() => {
    // ≈8 Hz is plenty for a numeric readout / flash trigger
    return subscribeEngineState(s => setTick({ beat: s.beatIndex, phase: s.phase }), 8)
  }, [])

  return beat
}

/**
 * Convenience: subscribe to throttled full engine snapshots for React state.
 */
export function useCardiacSnapshot(hz = 8) {
  const [snap, setSnap] = useState(null)
  useEffect(() => subscribeEngineState(setSnap, hz), [hz])
  return snap
}
