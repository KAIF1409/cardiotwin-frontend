/**
 * apiService.js  — FIXED
 * ======================
 * Single source of truth for all backend communication.
 *
 * FIXES APPLIED
 * -------------
 * 1. Added sendSliderParams()  — POST /params with fine-grained
 *    { contractility, afterload, infarct_pct } so slider moves
 *    actually reach the HeartEngine physics simulation.
 *
 * 2. Added fetchMetrics()      — GET /metrics to pull live patient
 *    MRI baseline from the backend instead of only the bundled JSON.
 *
 * 3. Expanded presetMap in sendPresetToEngine() to cover ALL
 *    DiseasePresets subcategory labels (DCM, HCM, ICM, HFpEF,
 *    PPCM, AS, MR, MS, AR, Endurance/Strength athlete, all MI
 *    subtypes). Subcategories map to the closest backend preset key.
 *
 * Transport strategy (unchanged):
 *   Primary  : WebSocket  ws://127.0.0.1:8000/ws  (100 ms push cadence)
 *   Fallback : HTTP GET   /state                   (200 ms poll when WS fails)
 *
 * Exported API
 * ------------
 *   startHeartEngine()                        — POST /start  + open WS
 *   stopHeartEngine()                         — POST /stop   + close WS
 *   sendPresetToEngine(label)                 — POST /params { preset }
 *   sendSliderParams(contractility,           — POST /params fine-grained
 *                    afterload, infarct_pct)
 *   fetchSimulateCycle()                      — GET  /simulate_cycle
 *   fetchMetrics()                            — GET  /metrics
 *   checkAPIHealth()                          — GET  /
 *   subscribeHeartData(callback)              — subscribe to live state
 *   getLatestState()                          — synchronous snapshot read
 */

// ── Config ─────────────────────────────────────────────────────────────────
import { pushLiveSample } from '../simulation/cardiacEngine'

const API_BASE = process.env.REACT_APP_API_BASE || 'http://127.0.0.1:8000'
const WS_BASE  = process.env.REACT_APP_WS_BASE  || 'ws://127.0.0.1:8000/ws'

// ── Internal state ─────────────────────────────────────────────────────────
let socket            = null
let latestState       = null
let listeners         = new Set()
let isStarted         = false
let wsConnected       = false
let reconnectAttempts = 0
let reconnectTimer    = null
let httpPollTimer     = null
let watchdogTimer     = null
let manualStop        = false
let lastSampleAt      = 0

// ── Rolling buffers for EF / HR computation ────────────────────────────────
const VOL_BUFFER_SIZE = 100
let volBuffer   = []
let timeBuffer  = []
let lastBeatTime = null
let hrEstimate   = 75
let efEstimate   = 59.9

// ── Derived metric helpers ──────────────────────────────────────────────────

function computeEF(volBuf) {
  if (volBuf.length < 10) return efEstimate
  const edv = Math.max(...volBuf)
  const esv = Math.min(...volBuf)
  if (edv <= 0) return efEstimate
  efEstimate = Math.round(((edv - esv) / edv) * 100)
  return Math.max(10, Math.min(85, efEstimate))
}

function computeHR(ecgVal, timeVal) {
  if (ecgVal > 2.0) {
    if (lastBeatTime !== null) {
      const rr = timeVal - lastBeatTime
      if (rr > 0.3 && rr < 2.0) {
        hrEstimate = Math.round(60 / rr)
      }
    }
    lastBeatTime = timeVal
  }
  return hrEstimate
}

// ── Subscriber bus ─────────────────────────────────────────────────────────

function notify(data) {
  latestState = data
  listeners.forEach(fn => fn(data))
}

export function subscribeHeartData(callback) {
  listeners.add(callback)
  if (latestState) callback(latestState)
  return () => listeners.delete(callback)
}

// ── Connection status bus ──────────────────────────────────────────────────
// 'connecting' | 'online_ws' | 'online_poll' | 'offline'
let connectionState = 'connecting'
const connListeners = new Set()

function setConnState(s) {
  if (connectionState === s) return
  connectionState = s
  connListeners.forEach(fn => { try { fn(s) } catch { /* noop */ } })
}

export function subscribeConnectionState(callback) {
  connListeners.add(callback)
  callback(connectionState)
  return () => connListeners.delete(callback)
}

export function getConnectionState() { return connectionState }

// ── State enrichment ────────────────────────────────────────────────────────

function processAndNotify(raw) {
  lastSampleAt = Date.now()
  // Feed the master cardiac engine — it blends real samples into its
  // locally-generated waveforms so every panel shares one truth.
  pushLiveSample(raw)

  const volume   = raw?.volume   ?? null
  const pressure = raw?.pressure ?? null
  const ecg      = raw?.ecg      ?? null
  const strain   = raw?.strain   ?? null
  const time     = raw?.time     ?? null

  if (volume !== null) {
    volBuffer.push(volume)
    timeBuffer.push(time)
    if (volBuffer.length > VOL_BUFFER_SIZE) {
      volBuffer.shift()
      timeBuffer.shift()
    }
  }

  const ef  = computeEF(volBuffer)
  const hr  = (ecg !== null && time !== null) ? computeHR(ecg, time) : hrEstimate
  const edv = volBuffer.length > 0 ? Math.max(...volBuffer) : 85.1
  const esv = volBuffer.length > 0 ? Math.min(...volBuffer) : 34.1
  const sv  = edv - esv
  const co  = parseFloat(((ef / 100) * hr * sv / 1000).toFixed(2))

  const sbp = pressure !== null ? Math.round(Math.max(pressure, 0))        : null
  const dbp = pressure !== null ? Math.round(Math.max(pressure * 0.65, 0)) : null

  const strainRegions = strain !== null ? {
    LV:     parseFloat((strain * 0.92).toFixed(4)),
    RV:     parseFloat((strain * 1.19).toFixed(4)),
    LA:     parseFloat((strain * 1.49).toFixed(4)),
    RA:     parseFloat((strain * 1.38).toFixed(4)),
    global: parseFloat(strain.toFixed(4)),
  } : null

  notify({
    volume, pressure, ecg, strain, time,
    ef, hr, co,
    edv:  Math.round(edv),
    esv:  Math.round(esv),
    sv:   Math.round(sv),
    sbp, dbp,
    strainRegions,
  })
}

// ── WebSocket transport ────────────────────────────────────────────────────
//
// RESILIENCE MODEL (fixes the old "gives up after 10 attempts" bug):
//   • Reconnect forever with exponential backoff + jitter (cap 10 s).
//   • A watchdog runs every 3 s: if no fresh sample and no live socket,
//     it health-probes GET / — the moment the backend answers, a WS
//     reconnect fires immediately instead of waiting out the backoff.
//   • HTTP /state polling is the data fallback while WS is down, so the
//     dashboard keeps updating even mid-reconnect.

function connectWebSocket() {
  if (manualStop) return
  if (socket && (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  )) return

  if (connectionState === 'offline' || connectionState === 'connecting') setConnState('connecting')

  let ws
  try {
    ws = new WebSocket(WS_BASE)
  } catch (e) {
    console.warn('⚠️ WS constructor failed:', e?.message)
    scheduleReconnect()
    return
  }
  socket = ws

  // Safety timer — some environments never fire onerror/onclose.
  const openTimeout = setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      try { ws.close() } catch { /* noop */ }
    }
  }, 5000)

  ws.onopen = () => {
    clearTimeout(openTimeout)
    wsConnected = true
    reconnectAttempts = 0
    stopHttpPoll()
    setConnState('online_ws')
    console.log('✅ WebSocket connected to', WS_BASE)
  }

  ws.onmessage = (event) => {
    try {
      const raw = JSON.parse(event.data)
      processAndNotify(raw)
    } catch (e) {
      console.warn('⚠️ WS parse error:', e)
    }
  }

  ws.onclose = () => {
    clearTimeout(openTimeout)
    if (socket === ws) socket = null
    if (!wsConnected && connectionState === 'connecting') {
      // never opened — go to poll fallback immediately
      startHttpPoll()
    }
    wsConnected = false
    if (!manualStop) {
      console.warn('⚠️ WebSocket closed — HTTP fallback active, reconnecting…')
      startHttpPoll()
      scheduleReconnect()
    } else {
      setConnState('offline')
    }
  }

  ws.onerror = () => {
    clearTimeout(openTimeout)
    try { ws.close() } catch { /* noop */ }
  }
}

function scheduleReconnect() {
  if (manualStop) return
  if (reconnectTimer) return                       // one pending attempt at a time
  reconnectAttempts++
  // Exponential backoff 0.5s → 10s with ±30 % jitter — retries FOREVER.
  const base = Math.min(500 * Math.pow(1.7, reconnectAttempts - 1), 10000)
  const delay = Math.round(base * (0.7 + Math.random() * 0.6))
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWebSocket()
  }, delay)
}

// Watchdog — detects "backend came back online" fast, even after hours offline.
function startWatchdog() {
  if (watchdogTimer) return
  watchdogTimer = setInterval(async () => {
    if (manualStop) return
    const stale = Date.now() - lastSampleAt > 3000
    if (!stale) {                                  // data flowing — all good
      if (!wsConnected && !httpPollTimer) connectWebSocket()
      return
    }
    if (!wsConnected) {
      // Probe health so recovery is instant when backend returns
      const health = await checkAPIHealth()
      if (health.status === 'ok') {
        if (!reconnectTimer) scheduleReconnect()
        if (!httpPollTimer) startHttpPoll()         // resume polling meanwhile
      } else {
        setConnState(httpPollTimer ? 'online_poll' : 'offline')
      }
    }
  }, 3000)
}

// ── HTTP fallback polling ──────────────────────────────────────────────────

async function httpPollTick() {
  try {
    const res = await fetch(`${API_BASE}/state`, { signal: AbortSignal.timeout(2000) })
    if (res.ok) {
      const raw = await res.json()
      processAndNotify(raw)
      setConnState(wsConnected ? 'online_ws' : 'online_poll')
    }
  } catch {
    setConnState(wsConnected ? 'online_ws' : 'offline')
  }
}

function startHttpPoll() {
  if (httpPollTimer || manualStop) return
  httpPollTimer = setInterval(httpPollTick, 200)
  httpPollTick()
}

function stopHttpPoll() {
  if (httpPollTimer) {
    clearInterval(httpPollTimer)
    httpPollTimer = null
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function startHeartEngine() {
  if (isStarted) return
  isStarted = true
  manualStop = false
  lastSampleAt = Date.now()

  try {
    await fetch(`${API_BASE}/start`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    })
    console.log('✅ Heart engine started (/start)')
  } catch (e) {
    console.warn('⚠️ /start failed:', e.message, '— backend offline, mock mode active')
  }

  startWatchdog()
  connectWebSocket()
  // Data fallback from the very first second (backend may be offline)
  startHttpPoll()
}

export async function stopHeartEngine() {
  manualStop = true
  try {
    await fetch(`${API_BASE}/stop`, { method: 'POST' })
  } catch { /* best-effort */ }

  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null }
  stopHttpPoll()
  socket?.close()
  socket            = null
  latestState       = null
  isStarted         = false
  wsConnected       = false
  reconnectAttempts = 0
  volBuffer         = []
  timeBuffer        = []
  lastBeatTime      = null
  setConnState('offline')
}

/**
 * FIX #1 — sendSliderParams
 * ─────────────────────────
 * Send fine-grained physiology parameters to the backend whenever a
 * slider moves.  The backend POST /params endpoint accepts:
 *   { contractility: 0–2.0, afterload: 0–2.0, infarct_pct: 0–100 }
 *
 * Frontend sliders use 0–100 scale, so we normalise:
 *   Contractility (0–100) → contractility (0–2.0)
 *   Afterload     (0–100) → afterload     (0–2.0)
 *   Infarct %     (0–100) → infarct_pct   (0–100) (no change)
 *
 * @param {number} contractility  — slider value 0–100
 * @param {number} afterload      — slider value 0–100
 * @param {number} infarct_pct    — slider value 0–100
 */
export async function sendSliderParams(contractility, afterload, infarct_pct) {
  // Normalise 0–100 slider range → backend 0–2.0 multiplier range
  const contractilityNorm = parseFloat(((contractility / 100) * 2.0).toFixed(3))
  const afterloadNorm     = parseFloat(((afterload     / 100) * 2.0).toFixed(3))
  const infarctNorm       = parseFloat(infarct_pct)

  try {
    const res = await fetch(`${API_BASE}/params`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        contractility: contractilityNorm,
        afterload:     afterloadNorm,
        infarct_pct:   infarctNorm,
      }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.warn('⚠️ /params (slider) returned', res.status, err)
    } else {
      console.log('✅ Slider params sent:', { contractilityNorm, afterloadNorm, infarctNorm })
    }
  } catch (e) {
    console.warn('⚠️ /params (slider) failed:', e.message)
  }
}

/**
 * FIX #2 — sendPresetToEngine (expanded preset map)
 * ──────────────────────────────────────────────────
 * Maps ALL DiseasePresets UI labels (including subcategory labels)
 * to a valid backend preset key.  Previously only 5 top-level labels
 * were mapped; all subcategory selections silently failed.
 *
 * Subcategories that don't have a 1:1 backend preset are mapped to
 * the closest physiologically equivalent preset key.
 */
export async function sendPresetToEngine(presetLabel) {
  const presetMap = {
    // ── Top-level presets ─────────────────────────────────────────
    '✅ Normal':                     'normal',
    '❤️‍🩹 Heart Failure':           'heart_failure',
    '🫀 Valve Stenosis':             'valve_stenosis',
    '⚡ Athlete Heart':               'athlete',
    '🔴 Myocardial Infarction':      'mi',
    '⚡ Arrhythmias':                 'normal',     // no backend preset — use normal base
    '🫧 Pericardial Disease':         'normal',

    // ── Heart Failure subcategories ───────────────────────────────
    'DCM — Dilated Cardiomyopathy':          'heart_failure',
    'HCM — Hypertrophic Cardiomyopathy':     'valve_stenosis',
    'ICM — Ischemic Cardiomyopathy':         'mi',
    'HFpEF — Preserved Ejection Fraction':   'heart_failure',
    'PPCM — Peripartum Cardiomyopathy':      'heart_failure',
    // short labels used in sub-name strip
    'Dilated Cardiomyopathy':   'heart_failure',
    'Hypertrophic Cardiomyopathy': 'valve_stenosis',
    'Ischemic Cardiomyopathy':  'mi',
    'Preserved Ejection Fraction': 'heart_failure',
    'Peripartum Cardiomyopathy': 'heart_failure',

    // ── Valve Disease subcategories ───────────────────────────────
    'AS — Aortic Stenosis':          'valve_stenosis',
    'MR — Mitral Regurgitation':     'valve_stenosis',
    'MS — Mitral Stenosis':          'valve_stenosis',
    'AR — Aortic Regurgitation':     'valve_stenosis',
    'Aortic Stenosis':               'valve_stenosis',
    'Mitral Regurgitation':          'valve_stenosis',
    'Mitral Stenosis':               'valve_stenosis',
    'Aortic Regurgitation':          'valve_stenosis',

    // ── Athlete subcategories ─────────────────────────────────────
    'Endurance Athlete (e.g. Cyclist)':      'athlete',
    'Strength Athlete (e.g. Weightlifter)':  'athlete',
    'Endurance':  'athlete',
    'Strength':   'athlete',

    // ── MI subcategories ──────────────────────────────────────────
    'STEMI — Anterior (LAD)':        'mi',
    'STEMI — Inferior (RCA)':        'mi',
    'NSTEMI — Subendocardial':       'mi',
    'Chronic MI — Old Scar':         'mi',
    'Chronic MI / LV Aneurysm':      'mi',
    'Ant. STEMI':   'mi',
    'Inf. STEMI':   'mi',
    'NSTEMI':       'mi',
    'Chronic MI':   'mi',

    // ── Arrhythmia subcategories ──────────────────────────────────
    'Atrial Fibrillation':           'heart_failure', // volume overload + rate
    'Complete Heart Block (CHB)':    'normal',
    'Ventricular Tachycardia (VT)':  'mi',
    'AF':   'heart_failure',
    'CHB':  'normal',
    'VT':   'mi',

    // ── Pericardial subcategories ─────────────────────────────────
    'Cardiac Tamponade':             'normal',   // compression — no specific preset
    'Constrictive Pericarditis':     'normal',
    'Tamponade':    'normal',
    'Constrictive': 'normal',
  }

  const preset = presetMap[presetLabel]
  if (!preset) {
    console.warn('⚠️ Unknown preset label (no backend mapping):', presetLabel)
    return
  }

  try {
    const res = await fetch(`${API_BASE}/params`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ preset }),
      signal:  AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.warn('⚠️ /params returned', res.status, err)
      return
    }
    console.log('✅ Preset applied:', preset, '(from label:', presetLabel, ')')
  } catch (e) {
    console.warn('⚠️ /params failed:', e.message)
  }
}

export async function fetchSimulateCycle() {
  try {
    const res = await fetch(`${API_BASE}/simulate_cycle`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.warn('⚠️ /simulate_cycle returned', res.status)
      return null
    }
    return await res.json()
  } catch (e) {
    console.warn('⚠️ /simulate_cycle failed:', e.message)
    return null
  }
}

/**
 * FIX #3 — fetchMetrics
 * ─────────────────────
 * Fetches live patient MRI baseline from GET /metrics.
 * Previously the frontend only read the bundled static metrics.json.
 * This allows real patient data loaded by the backend to surface in
 * the UI (PatientSelector, metric cards, PV loop badge values).
 *
 * Returns the full metrics.json structure or null on failure.
 */
export async function fetchMetrics() {
  try {
    const res = await fetch(`${API_BASE}/metrics`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.warn('⚠️ /metrics returned', res.status)
      return null
    }
    return await res.json()
  } catch (e) {
    console.warn('⚠️ /metrics failed:', e.message)
    return null
  }
}

export async function checkAPIHealth() {
  try {
    const res = await fetch(`${API_BASE}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    })
    if (res.ok) {
      return { status: 'ok', message: 'Backend connected' }
    }
    return { status: 'offline', message: `Backend error (${res.status})` }
  } catch {
    return { status: 'offline', message: 'Backend not reachable' }
  }
}

export function getLatestState() {
  return latestState
}

// ── Debug helper ───────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.__cardioDebug = () => {
    console.table({
      wsConnected,
      isStarted,
      socketState:       socket?.readyState ?? 'null',
      reconnectAttempts,
      volBufferLength:   volBuffer.length,
      httpPollActive:    !!httpPollTimer,
      efEstimate,
      hrEstimate,
    })
    console.log('latestState:', latestState)
  }
}