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
 *   • `phase`— continuous 0→1 position in the current cardiac cycle.
 *   • `beat`— monotonically increasing beat counter (same contract as v1,
 *               so existing consumers keep working).
 *
 * Components that need per-frame data should NOT re-render through this
 * hook — they should register with onEngineFrame() instead.  This hook is
 * for lightweight UI (badges, meters).
 */

import { useEffect, useRef, useState } from 'react'
import { subscribeEngineState, setEngineParams, onEngineFrame } from '../simulation/cardiacEngine'
import { subscribePackets } from '../services/apiService'

const clamp01 = v => Math.max(0, Math.min(1, v))

/** A packet stream older than this (ms) is considered stale — the WS push
 *  cadence is 100 ms, so 1.2 s ≈ 12 missed packets before we fall back to
 *  the locally phase-locked engine (tab hidden, backend down, etc.). */
const PACKET_FRESH_MS = 1200

/**
 * useContractionDriver() — packet→morph bridge for the NCERT heart.
 * ═══════════════════════════════════════════════════════════════════════
 * Returns a REF (no re-renders):  { lv, rv, source }  ∈ [0, 1]
 *
 *   • source === 'packet'— live backend streaming: the influence is the
 *     normalised LV pressure envelope of the INCOMING 100 ms packets. The
 *     backend generates ECG and pressure from the same cardiac cycle, so
 *     the morph stays locked to the live ECG overlay in ECGGraph.jsx.
 *   • source === 'engine'— offline: influence is the engine's
 *     shorteningAt(phase), i.e. the exact same phase variable that paints
 *     the local ECG waveform (sync guaranteed by construction).
 *
 * Feed ref.current.lv into  mesh.morphTargetInfluences[0]  ("Systole")
 * every frame from the R3F component — see NcertHeart.jsx.
 */
export function useContractionDriver() {
  const envRef = useRef({ min: null, max: null, pulse: 0, at: 0 })
  const contractionRef = useRef({ lv: 0, rv: 0, source: 'engine' })

  // ── Packet stream → rolling pressure envelope (10 Hz) ────────────────────
  useEffect(
    () =>
      subscribePackets(packet => {
        const p = packet?.pressure
        if (!Number.isFinite(p)) return
        const env = envRef.current
        if (env.min === null) {
          env.min = p
          env.max = p
        }
        // Asymmetric decay keeps the envelope tracking slow drift (preload /
        // afterload changes) while still resolving the ~1 Hz pulse.
        env.max = Math.max(p, env.max * (1 - 0.015))
        env.min = Math.min(p, env.min + (env.max - env.min) * 0.015)
        const span = env.max - env.min
        const raw = span > 4 ? (p - env.min) / span : 0 // degenerate → flat
        env.pulse += (raw - env.pulse) * 0.4 // EMA smoothing
        env.at = Date.now()
      }),
    []
  )

  // ── Per-frame decision: packet envelope vs engine phase ─────────────────
  useEffect(
    () =>
      onEngineFrame(s => {
        const c = contractionRef.current
        const env = envRef.current
        if (Date.now() - env.at < PACKET_FRESH_MS) {
          c.lv = clamp01(env.pulse)
          c.rv = c.lv * 0.92 // RV squeezes slightly less
          c.source = 'packet'
        } else {
          c.lv = s.contractLV // 0 diastole → ~1 peak systole
          c.rv = s.contractRV
          c.source = 'engine'
        }
      }),
    []
  )

  return contractionRef
}

/**
 * useLiveVitals(hz) — throttled { beat, phase, bpm, ef, sv, co, live, source }
 * snapshot for HUD / projector readouts. `co`is cardiac output in L/min
 * (CO = SV × HR / 1000) — used by the flow-particle speed governor.
 */
export function useLiveVitals(hz = 4) {
  const [vitals, setVitals] = useState({
    beat: 0,
    phase: 0,
    bpm: 75,
    ef: 60,
    sv: 70,
    co: 5.0,
    live: false,
    source: null
  })

  useEffect(
    () =>
      subscribeEngineState(
        s =>
          setVitals(v => ({
            ...v,
            beat: s.beatIndex,
            phase: s.phase,
            bpm: s.bpm,
            ef: s.ef,
            sv: s.sv,
            co: +((s.sv * s.bpm) / 1000).toFixed(2),
            live: s.live
          })),
        hz
      ),
    [hz]
  )

  useEffect(
    () =>
      subscribePackets(p =>
        setVitals(v => (v.source === (p?.source ?? null) ? v : { ...v, source: p?.source ?? null }))
      ),
    []
  )

  return vitals
}

export default function useHeartbeat(heartRate) {
  const [{ beat }, setTick] = useState({ beat: 0, phase: 0 })

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
