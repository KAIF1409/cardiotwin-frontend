/**
 * APIStatus.jsx
 * =============
 * Header widget — polls GET / every 30 s and shows connection status.
 *
 * 🟢 API Live    — backend returned 200 OK
 * 🟡 Mock Mode   — special status from backend
 * 🔴 API Offline — network error or non-2xx response
 *
 * Place this file at:  src/components/APIStatus.jsx
 */

import { useEffect, useState } from 'react'
import { checkAPIHealth } from '../services/apiService'

export default function APIStatus() {
  const [status, setStatus] = useState({ status: 'checking', message: 'Checking...' })

  useEffect(() => {
    const check = async () => {
      try {
        const result = await checkAPIHealth()
        setStatus(result)
      } catch {
        setStatus({ status: 'offline', message: 'API unreachable' })
      }
    }

    check()                                      // immediate check on mount
    const interval = setInterval(check, 30_000)  // then every 30 s
    return () => clearInterval(interval)
  }, [])

  const color =
    status.status === 'ok'   ? '#00e676' :
    status.status === 'mock' ? '#ff9800' :
    '#ef5350'

  const dot =
    status.status === 'ok'      ? '🟢' :
    status.status === 'mock'    ? '🟡' :
    status.status === 'checking'? '⚪' :
    '🔴'

  const label =
    status.status === 'ok'      ? 'API Live'    :
    status.status === 'mock'    ? 'Mock Mode'   :
    status.status === 'checking'? 'Connecting…' :
    'API Offline'

  return (
    <div
      title={status.message}
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        '4px',
        fontSize:   '10px',
        color,
        cursor:     'default',
      }}
    >
      <span>{dot}</span>
      <span>{label}</span>
    </div>
  )
}