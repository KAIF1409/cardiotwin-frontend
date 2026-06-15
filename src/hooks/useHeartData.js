/**
 * useHeartData.js  —  FIXED
 * =========================
 * React hook — subscribes to the live heart state from apiService.
 * Returns { heartData } which updates on every WebSocket push (~10 Hz).
 *
 * FIX: Import path corrected.
 *   The zip ships all files flat (no subdirectory structure preserved).
 *   When the project is assembled into the standard CRA layout the hook
 *   lives at src/hooks/useHeartData.js and apiService lives at
 *   src/services/apiService.js, so the relative import is '../services/apiService'.
 *
 *   Additionally: this hook accepts NO arguments.  App.js was incorrectly
 *   calling useHeartData(params) — that argument is silently ignored.
 */

import { useState, useEffect } from 'react'
import { subscribeHeartData } from '../services/apiService'

export default function useHeartData() {
  const [heartData, setHeartData] = useState(null)

  useEffect(() => {
    const unsub = subscribeHeartData((data) => {
      if (!data) return
      // Avoid unnecessary re-renders when state has not actually changed
      setHeartData(prev =>
        JSON.stringify(prev) === JSON.stringify(data) ? prev : { ...data }
      )
    })
    return () => unsub()
  }, [])

  return { heartData }
}