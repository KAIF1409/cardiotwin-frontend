/**
 * cardiacEngine.js
 * ════════════════════════════════════════════════════════════════════
 * MASTER CARDIAC SIMULATION CLOCK — single source of truth.
 *
 * Every animated surface in the app samples THIS engine:
 *   • ECGGraph        → ecg waveform buffer
 *   • PVLoop          → lvVolume / lvPressure parametric trace + cursor
 *   • StrainPanel     → instantaneous GLS / LV / RV strain
 *   • DeformableHeart → chamber contraction factors (systole/diastole)
 *   • ChamberHeart    → same
 *   • SlicedHeart     → same
 *   • BloodFlowParticles → flowAortic / flowPulmonary velocity windows
 *   • NodalConduction → conductionNode timeline (SA/AV/HIS/Purkinje)
 *
 * Synchronization is guaranteed BY CONSTRUCTION: there is exactly one
 * phase variable (0→1 per beat) advanced by one rAF loop. Components
 * never own timers, so BPM/slider changes rescale everything together.
 *
 * Waveform math is parameterised by the five clinical sliders:
 *   Preload · Afterload · Contractility · Infarct % · Valve Area
 * plus Heart Rate (cycle period).
 * ════════════════════════════════════════════════════════════════════
 */

// ── Cardiac phase windows (fractions of one cycle) ──────────────────────────
export const PHASE = {
  ATRIAL_SYSTOLE:      [0.00, 0.14],
  ISOVOL_CONTRACTION:  [0.14, 0.20],
  VENTRICULAR_EJECTION:[0.20, 0.46],
  ISOVOL_RELAXATION:   [0.46, 0.54],
  VENTRICULAR_FILLING: [0.54, 1.00],   // rapid fill 0.54–0.72, diastasis, atrial kick ≥0.90
  // Conduction system (PUC track)
  SA_NODE:             [0.00, 0.10],
  AV_NODE:             [0.115, 0.165],
  BUNDLE_OF_HIS:       [0.150, 0.185],
  PURKINJE:            [0.170, 0.225],
  REPOLARIZATION:      [0.32, 0.55],   // T-wave window
}

const inWindow = (p, [a, b]) => p >= a && p < b

// ── Math helpers ────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const lerp  = (a, b, t) => a + (b - a) * t
/** smooth 0→1 ramp across window */
const smoothWin = (p, a, b) => {
  if (p <= a) return 0
  if (p >= b) return 1
  const t = (p - a) / (b - a)
  return t * t * (3 - 2 * t)
}
const gauss = (x, mu, sig) => Math.exp(-((x - mu) ** 2) / (2 * sig * sig))
/** normalised bell pulse fully inside [a,b] */
const bell = (p, a, b) => (p > a && p < b ? Math.sin(Math.PI * (p - a) / (b - a)) : 0)

// ── Engine singleton state ──────────────────────────────────────────────────
const params = {
  heartRate:      75,    // bpm
  preload:        50,    // 0–100
  afterload:      50,    // 0–100
  contractility:  60,    // 0–100
  infarct:        0,     // 0–100 %
  valve:          100,   // 40–130 %
}

let t            = 0        // seconds since start
let phase        = 0        // 0→1 within current beat
let beatIndex    = 0
let speed        = 1        // education slow-motion multiplier
let frozen       = false
let frozenPhase  = 0
let circulationMode = 'both'           // 'both' | 'systemic' | 'pulmonary'
let conductionOverlay = false
let running      = false
let rafId        = null
let lastNow      = 0

// Live-backend blend (WebSocket ~10 Hz sample)
const live = {
  active:   false,   // true once any WS/poll sample arrived recently
  ecg:      null,
  volume:   null,
  pressure: null,
  strainRegions: null,
  lastAt:   0,
}
const LIVE_TTL_MS = 2500   // consider backend stale after this without samples

// Reusable output object (mutated in place — zero GC pressure at 60 fps)
const state = {
  t: 0, phase: 0, beatIndex: 0, bpm: params.heartRate, cycleSeconds: 0.8,
  ecg: 0,
  lvVolume: 120, lvPressure: 10, aoPressure: 80,
  edv: 120, esv: 50, sv: 70, ef: 60,
  strainGlobal: 0, strainLV: 0, strainRV: 0, strainLA: 0, strainRA: 0,
  strainPeakLV: -20.5, strainPeakRV: -26,
  flowAortic: 0, flowPulmonary: 0, flowMitral: 0, flowTricuspid: 0,
  contractLV: 0, contractRV: 0, contractLA: 0, contractRA: 0,   // 0..1 contraction factors
  conductionNode: null,                                          // 'SA'|'AV'|'HIS'|'PURKINJE'|null
  circulationMode, conductionOverlay,
  frozen: false,
  live: false,
}

const frameListeners = new Set()   // per-frame imperative callbacks (canvas / R3F)


// ── Derived physiology ──────────────────────────────────────────────────────
function computeVolumes() {
  // Frank–Starling: EDV follows preload
  const edv = 70 + params.preload * 0.9                      // 70 → 160 ml
  // Contractility → baseline EF  (18 ⇒ ~20 %,  60 ⇒ ~60 %,  95 ⇒ ~75 %)
  let ef = 20 + 55 * Math.pow(clamp(params.contractility, 0, 100) / 100, 0.85)
  ef *= 1 - (params.infarct / 100) * 0.55                     // scar kills pump
  ef -= Math.max(0, params.afterload - 60) * 0.15             // high resistance bleeds EF
  ef += Math.max(0, 35 - params.afterload) * 0.08             // low resistance helps
  ef = clamp(ef, 8, 82)
  const esv = edv * (1 - ef / 100)
  return { edv, esv, ef, sv: edv - esv }
}

function computePressures() {
  const diaBP = 55 + params.afterload * 0.55                  // 55 → 110 mmHg
  const stenosisGrad = Math.max(0, 100 - params.valve) * 0.45 // valve narrowing gradient
  const sysBoost = 1 + (params.contractility / 100) * 0.28
  const sysBP  = clamp(diaBP * sysBoost * (params.valve / 100) + stenosisGrad, 40, 240)
  const peakLVP = sysBP + stenosisGrad                        // LV must exceed aortic
  return { diaBP, sysBP, peakLVP }
}

// ── Waveform generators (pure functions of phase p ∈ [0,1)) ────────────────

function ecgMorphology() {
  const { infarct, contractility } = params
  const mi    = infarct > 30
  const hf    = contractility < 35 && !mi
  const ath   = contractility > 80 && infarct < 10
  return {
    aP:  hf ? 0.22 : 0.16,
    sP:  0.024,
    aQ:  mi ? 0.28 : 0.10,          // pathological Q in MI
    sQ:  mi ? 0.014 : 0.007,
    aR:  ath ? 1.45 : hf ? 0.65 : 1.10,
    sR:  hf ? 0.013 : 0.009,        // wide QRS in HF
    aS:  0.24,
    sS:  0.009,
    aT:  ath ? 0.42 : hf ? 0.16 : 0.30,
    sT:  0.048,
    stShift: mi ? (infarct / 100) * 0.30 : 0,   // ST elevation in MI
  }
}

function ecgAt(p) {
  const m = ecgMorphology()
  let v = 0
  v += m.aP * gauss(p, 0.062, m.sP)
  v -= m.aQ * gauss(p, 0.152, m.sQ)
  v += m.aR * gauss(p, 0.170, m.sR)
  v -= m.aS * gauss(p, 0.190, m.sS)
  v += m.aT * gauss(p, 0.380, m.sT)
  if (m.stShift > 0 && p > 0.20 && p < 0.34) v += m.stShift   // elevated ST segment
  return v
}

function volumeAt(p, edv, esv) {
  if (p < PHASE.ISOVOL_CONTRACTION[0]) {
    // filling finished by end of atrial systole
    const kick = smoothWin(p, 0.02, 0.135)
    return lerp(edv * 0.86, edv, kick)
  }
  if (p < PHASE.VENTRICULAR_EJECTION[0]) return edv            // isovol contraction
  if (p < PHASE.VENTRICULAR_EJECTION[1]) {
    const k = smoothWin(p, 0.20, 0.46)
    return lerp(edv, esv, k)                                   // ejection
  }
  if (p < PHASE.VENTRICULAR_FILLING[1]) {
    const k = smoothWin(p, 0.46, 0.60)
    // rapid passive filling (E-wave) then plateau
    const fill = 1 - Math.exp(-k * 3.2)
    return lerp(esv, edv * 0.86, fill * 0.92)
  }
  // diastasis + atrial kick (A-wave)
  const kick = smoothWin(p, 0.88, 1.0)
  return lerp(edv * 0.86, edv, kick)
}

function lvPressureAt(p, { diaBP, peakLVP }) {
  const edp = 6 + params.preload * 0.05                        // end-diastolic LVP
  if (p < PHASE.ISOVOL_CONTRACTION[0]) {
    const bump = bell(p, 0.0, 0.14) * 2.5                      // atrial systole bump
    return edp - 1.5 + bump
  }
  if (p < PHASE.ISOVOL_CONTRACTION[1]) {
    const k = smoothWin(p, 0.14, 0.20)
    return lerp(edp, diaBP + 4, k)                             // isovol rise
  }
  if (p < 0.33) return lerp(diaBP + 4, peakLVP, smoothWin(p, 0.20, 0.33))
  if (p < PHASE.VENTRICULAR_EJECTION[1]) return lerp(peakLVP, diaBP + 6, smoothWin(p, 0.33, 0.46))
  if (p < PHASE.ISOVOL_RELAXATION[1]) {
    const k = smoothWin(p, 0.46, 0.54)
    return lerp(diaBP + 6, edp - 2, k)                         // isovol relaxation drop
  }
  const suction = bell(p, 0.54, 0.72) * 1.8                    // elastic recoil dip
  return edp - 2 + suction
}

function aoPressureAt(p, { diaBP, sysBP }) {
  if (p < PHASE.VENTRICULAR_EJECTION[0]) {
    // diastolic decay tail wrapping from the previous beat
    const decay = Math.exp(-(p + 0.54) * 2.1)
    return diaBP - 3 + (sysBP - diaBP) * 0.10 * decay
  }
  if (p < 0.34) return lerp(diaBP, sysBP, smoothWin(p, 0.20, 0.34))
  if (p < 0.47) return lerp(sysBP, diaBP + 7, smoothWin(p, 0.34, 0.47))
  const notch = bell(p, 0.47, 0.505) * 5                       // dicrotic notch
  const decay = Math.exp(-(p - 0.50) * 2.6)
  return diaBP - 3 + (sysBP - diaBP) * 0.10 * decay + notch
}

/** ventricular mechanical shortening fraction 0..1 */
function shorteningAt(p) {
  if (p < 0.14) return 0
  if (p < 0.46) return smoothWin(p, 0.14, 0.46)                // contract
  if (p < 0.64) return 1 - smoothWin(p, 0.46, 0.64)            // relax
  return 0
}

// ── Per-frame evaluation ────────────────────────────────────────────────────

function evaluate() {
  const { edv, esv, ef, sv } = computeVolumes()
  const pr = computePressures()

  const p       = frozen ? frozenPhase : phase
  const vol     = volumeAt(p, edv, esv)
  const lvp     = lvPressureAt(p, pr)
  const ao      = aoPressureAt(p, pr)
  const shorten = shorteningAt(p)
  const akick   = atrialKickAt(p)
  const node    = conductionAt(p)

  // Infarct dampens LV contraction regionally; RV less affected
  const lvDamp = 1 - (params.infarct / 100) * 0.85

  state.t            = t
  state.phase        = p
  state.beatIndex    = beatIndex
  state.bpm          = params.heartRate
  state.cycleSeconds = 60 / params.heartRate
  state.ecg          = ecgAt(p)
  state.lvVolume     = vol
  state.lvPressure   = lvp
  state.aoPressure   = ao
  state.edv          = Math.round(edv)
  state.esv          = Math.round(esv)
  state.sv           = Math.round(sv)
  state.ef           = Math.round(ef)
  state.strainPeakLV = -(11 + 14 * (ef / 75)) * lvDamp - 2    // ≈ −20 % healthy
  state.strainPeakRV = state.strainPeakLV * 1.27
  state.strainLV     = state.strainPeakLV * shorten
  state.strainRV     = state.strainPeakRV * shorten
  state.strainLA     = -6 * akick
  state.strainRA     = -5 * akick
  state.strainGlobal = state.strainLV * 0.62 + state.strainRV * 0.38
  state.flowAortic    = bell(p, 0.20, 0.46)
  state.flowPulmonary = bell(p, 0.17, 0.49) * 0.85
  state.flowMitral    = Math.max(bell(p, 0.54, 0.74), bell(p, 0.86, 1.0) * 0.55)
  state.flowTricuspid = state.flowMitral * 0.9
  state.contractLV    = shorten * (1 - (params.infarct / 100) * 0.9)
  state.contractRV    = shorten * (1 - (params.infarct / 100) * 0.4)
  state.contractLA    = akick
  state.contractRA    = akick
  state.conductionNode    = node
  state.circulationMode   = circulationMode
  state.conductionOverlay = conductionOverlay
  state.frozen            = frozen
  state.live              = live.active && (Date.now() - live.lastAt) < LIVE_TTL_MS

  // Blend real backend samples into display channels when fresh
  if (state.live) {
    if (live.ecg      !== null) state.ecg      = live.ecg
    if (live.volume   !== null) state.lvVolume = live.volume
    if (live.pressure !== null) state.lvPressure = live.pressure
  }
  return state
}

function loop(now) {
  rafId = requestAnimationFrame(loop)
  if (!lastNow) lastNow = now
  const dt = Math.min((now - lastNow) / 1000, 0.1)   // clamp tab-switch jumps
  lastNow = now
  if (!frozen) {
    t += dt * speed
    const cycle = 60 / params.heartRate
    phase += dt * speed / cycle
    if (phase >= 1) { phase %= 1; beatIndex++ }
  }
  evaluate()
  fireFrames()
}

// ── Public API ──────────────────────────────────────────────────────────────

export function startEngine() {
  if (running) return
  running = true
  lastNow = 0
  rafId = requestAnimationFrame(loop)
}

export function stopEngine() {
  running = false
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
}

/** Register an imperative per-frame callback (canvas draws, R3F useFrame). */
export function onEngineFrame(fn) {
  frameListeners.add(fn)
  return () => frameListeners.delete(fn)
}

/** Throttled React-state subscription (default ≈8 Hz) for numeric readouts. */
export function subscribeEngineState(fn, hz = 8) {
  let last = 0
  const wrapped = () => {
    const now = performance.now()
    if (now - last < 1000 / hz) return
    last = now
    fn({ ...state })
  }
  frameListeners.add(wrapped)
  fn({ ...state })
  return () => frameListeners.delete(wrapped)
}

export function getEngineState() { return state }

export function setEngineParams(patch) {
  Object.assign(params, patch)
  if ('heartRate' in patch) state.bpm = params.heartRate
}

export function getEngineParams() { return ({ ...params }) }

/** Education slow-motion: 0.1 = 10× slower. */
export function setEngineSpeed(s) { speed = clamp(s, 0.05, 3) }

/** Freeze the cycle at an exact phase (cardiac-cycle breakdown). null unfreezes. */
export function freezeAtPhase(pOrNull) {
  if (pOrNull === null || pOrNull === undefined) { frozen = false; return }
  frozen = true
  frozenPhase = clamp(pOrNull, 0, 0.999)
}

export function isFrozen() { return frozen }

export function setCirculationMode(mode) {
  circulationMode = mode === 'systemic' || mode === 'pulmonary' ? mode : 'both'
}

export function setConductionOverlay(on) { conductionOverlay = !!on }

/** apiService pushes live backend samples here. */
export function pushLiveSample(raw = {}) {
  live.active = true
  live.lastAt = Date.now()
  if (raw.ecg      !== undefined && raw.ecg      !== null) live.ecg      = parseFloat(raw.ecg)
  if (raw.volume   !== undefined && raw.volume   !== null) live.volume   = parseFloat(raw.volume)
  if (raw.pressure !== undefined && raw.pressure !== null) live.pressure = parseFloat(raw.pressure)
  if (raw.strainRegions) live.strainRegions = raw.strainRegions
}

/** Reset cycle position (used when presets change so traces restart cleanly). */
export function resetCycle() { phase = 0; t = 0; beatIndex = 0 }

/**
 * Sample a full cardiac cycle for static plot traces (PV loop path).
 * Uses the CURRENT parameter values — call again whenever params change.
 */
export function sampleCycle(n = 120) {
  const { edv, esv } = computeVolumes()
  const pr = computePressures()
  const out = []
  for (let i = 0; i < n; i++) {
    const p = i / n
    out.push({
      phase:      p,
      volume:     volumeAt(p, edv, esv),
      lvPressure: lvPressureAt(p, pr),
      aoPressure: aoPressureAt(p, pr),
      ecg:        ecgAt(p),
    })
  }
  return out
}

// Auto-start in browser
if (typeof window !== 'undefined') startEngine()
function fireFrames() {
  frameListeners.forEach(fn => { try { fn(state) } catch (e) { console.warn('engine listener error', e) } })
}


function atrialKickAt(p) { return bell(p, 0.0, 0.14) }

function conductionAt(p) {
  if (inWindow(p, PHASE.SA_NODE))        return 'SA'
  if (inWindow(p, PHASE.AV_NODE))        return 'AV'
  if (inWindow(p, PHASE.BUNDLE_OF_HIS))  return 'HIS'
  if (inWindow(p, PHASE.PURKINJE))       return 'PURKINJE'
  if (inWindow(p, PHASE.REPOLARIZATION)) return 'T'
  return null
}

