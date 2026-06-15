/**
 * PatientSelector.jsx
 * ====================
 * Dropdown to select a patient.  For each patient:
 *   1. Fetches metrics.json from /patients/{id}/metrics.json
 *   2. Probes whether the .glb mesh file actually exists before passing
 *      meshPath to App -- prevents the "Unexpected token '<'" crash that
 *      occurs when useGLTF tries to parse a 404 HTML error page as JSON.
 *
 * BUG FIX (meshPath 404 -- HTML crash):
 *   Patient 001--006 .glb files don't ship with the repo.  React's dev
 *   server returns a 404 HTML page for any unknown path.  useGLTF then
 *   tries to parse that HTML as JSON and throws:
 *     "Unexpected token '<', '<!DOCTYPE ...' is not valid JSON"
 *
 *   Fix: HEAD-request the meshPath first.  If it fails, pass null so
 *   HeartModel falls back to /models/heart.glb (the default bundled model).
 *
 * Place this file at:  src/components/PatientSelector.jsx
 */

import { useState } from 'react'

const PATIENTS = [
  {
    id:          'patient085',
    label:       'Patient 085 (Demo)',
    meshPath:    '/models/heart.glb',           // always present -- bundled
    metricsPath: '/patients/patient085/metrics.json',
  },
  {
    id:          'patient001',
    label:       'Patient 001',
    meshPath:    '/patients/patient001/full_heart.glb',
    metricsPath: '/patients/patient001/metrics.json',
  },
  {
    id:          'patient002',
    label:       'Patient 002',
    meshPath:    '/patients/patient002/full_heart.glb',
    metricsPath: '/patients/patient002/metrics.json',
  },
  {
    id:          'patient003',
    label:       'Patient 003',
    meshPath:    '/patients/patient003/full_heart.glb',
    metricsPath: '/patients/patient003/metrics.json',
  },
  {
    id:          'patient004',
    label:       'Patient 004',
    meshPath:    '/patients/patient004/full_heart.glb',
    metricsPath: '/patients/patient004/metrics.json',
  },
  {
    id:          'patient005',
    label:       'Patient 005',
    meshPath:    '/patients/patient005/full_heart.glb',
    metricsPath: '/patients/patient005/metrics.json',
  },
  {
    id:          'patient006',
    label:       'Patient 006',
    meshPath:    '/patients/patient006/full_heart.glb',
    metricsPath: '/patients/patient006/metrics.json',
  },
]

/**
 * Probe whether a static asset actually exists.
 * Returns the path if it does, or null if the server returns a non-2xx
 * status (including the 404 HTML page React dev-server sends for unknowns).
 */
async function probeAsset(path) {
  try {
    const res = await fetch(path, { method: 'HEAD' })
    return res.ok ? path : null
  } catch {
    return null
  }
}

export default function PatientSelector({ onSelectPatient, currentPatient }) {
  const [loading,     setLoading]     = useState(false)
  const [meshWarning, setMeshWarning] = useState(null)

  const handleChange = async (e) => {
    const patient = PATIENTS.find(p => p.id === e.target.value)
    if (!patient) return

    setLoading(true)
    setMeshWarning(null)

    try {
      // -- 1. Fetch patient metrics --
      let metrics = null
      try {
        const res = await fetch(patient.metricsPath)
        if (res.ok) {
          const raw = await res.json()
          metrics = {
            ef:            raw?.cardiac_function?.EF_pct    ?? 59.9,
            edv:           raw?.cardiac_function?.EDV_mL    ?? 85.1,
            esv:           raw?.cardiac_function?.ESV_mL    ?? 34.1,
            wallThickness: raw?.wall_thickness_mm           ?? 5.5,
            efStatus:      raw?.cardiac_function?.EF_status ?? 'Normal',
          }
        }
      } catch {
        // metrics stay null -- App will use baseline
      }

      // -- 2. Validate .glb exists before passing to useGLTF --
      //    useGLTF has no built-in 404 guard: it fetches the URL and
      //    tries to parse whatever comes back as a binary GLB/JSON.
      //    A 404 HTML page causes the "Unexpected token '<'" crash.
      let resolvedMeshPath = patient.meshPath
      if (patient.meshPath !== '/models/heart.glb') {
        // Only probe non-default paths; the default is always present
        const exists = await probeAsset(patient.meshPath)
        if (!exists) {
          resolvedMeshPath = null   // HeartModel falls back to /models/heart.glb
          setMeshWarning(
            `3D model for ${patient.label} not found -- showing default heart.`
          )
        }
      }

      onSelectPatient({
        ...patient,
        meshPath: resolvedMeshPath,   // null -- HeartModel uses its own default
        metrics,
      })
    } catch (err) {
      console.warn('PatientSelector error:', err)
      onSelectPatient({ ...patient, meshPath: null, metrics: null })
    }

    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <h3 style={{
        color: '#00bcd4', fontSize: '11px',
        margin: 0, letterSpacing: '2px', textTransform: 'uppercase',
      }}>
        👤 Patient
      </h3>

      <select
        onChange={handleChange}
        defaultValue="patient085"
        style={{
          background:   '#0f0f1a',
          border:       '1px solid #00bcd444',
          color:        '#00bcd4',
          borderRadius: '6px',
          padding:      '7px 10px',
          fontSize:     '11px',
          cursor:       'pointer',
          width:        '100%',
        }}
      >
        {PATIENTS.map(p => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>

      {loading && (
        <p style={{ color: '#555', fontSize: '10px', margin: 0 }}>
          Loading patient data…
        </p>
      )}

      {/* Mesh fallback warning */}
      {meshWarning && !loading && (
        <p style={{ color: '#ff9800', fontSize: '10px', margin: 0 }}>
          ⚠️ {meshWarning}
        </p>
      )}

      {/* Patient baseline metrics */}
      {currentPatient?.metrics && (
        <div style={{
          background: '#0f0f1a', borderRadius: '6px',
          padding: '6px 8px', fontSize: '10px',
        }}>
          <div style={{ color: '#555', marginBottom: '2px' }}>Patient baseline:</div>
          <div style={{ color: '#00e676' }}>
            EF: {currentPatient.metrics.ef}% -- {currentPatient.metrics.efStatus}
          </div>
          <div style={{ color: '#00bcd4' }}>
            EDV: {currentPatient.metrics.edv} ml | ESV: {currentPatient.metrics.esv} ml
          </div>
          <div style={{ color: '#00bcd4' }}>
            Wall: {currentPatient.metrics.wallThickness} mm
          </div>
        </div>
      )}
    </div>
  )
}