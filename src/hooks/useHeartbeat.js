/**
 * useHeartbeat.js
 * ===============
 * React hook — fires an incrementing counter at the given heart rate (BPM).
 * Used to drive pulsation animations in the 3-D heart model.
 *
 * Place this file at:  src/hooks/useHeartbeat.js
 *
 * @param {number} heartRate  — beats per minute (clamped 30–200)
 * @returns {number}          — beat counter (increments once per beat)
 */

import { useEffect, useRef, useState } from 'react'

export default function useHeartbeat(heartRate) {
  const [beat, setBeat] = useState(0)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)

    const bpm = Math.max(30, Math.min(200, heartRate || 75))
    const intervalMs = (60 / bpm) * 1000

    intervalRef.current = setInterval(() => {
      setBeat(b => b + 1)
    }, intervalMs)

    return () => clearInterval(intervalRef.current)
  }, [heartRate])

  return beat
}