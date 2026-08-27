/**
 * heartSounds.js  —  AUSCULTATION SYNTHESIS ENGINE  (Web Audio)
 * ═════════════════════════════════════════════════════════════
 * Clinical heart sounds generated procedurally, LOCKED to the master
 * cardiac engine's phase clock (same clock as ECG / 3-D mesh):
 *
 *   S1 "lub" @ 0.14 — AV valves snap shut at QRS (55 Hz thump, ~120 ms)
 *   S2 "dub" @ 0.46 — semilunar valves close (shorter, higher, tiny split)
 *   S3 @ ~0.58 — rapid-filling gallop: PATHOLOGICAL in adults (dilated /
 *        failing ventricle) → fires when Contractility < 40
 *   S4 @ ~0.09 — presystolic gallop: atrial kick against a STIFF ventricle
 *        → fires when Afterload > 75 or Infarct > 40
 *   Murmur — aortic stenosis: systolic crescendo–decrescendo noise
 *        (band-passed pink noise) filling S1→S2 whenever Valve Area < 70%
 *        (turbulence needs a ≥30 mmHg gradient — the narrowed valve).
 *
 * AudioContext is created lazily on first toggle (autoplay-safe, iOS
 * gesture requirement). Timing comes from onEngineFrame only — no timers,
 * so HR / freeze / slow-motion are inherently respected.
 */

import { onEngineFrame, getEngineState } from '../simulation/cardiacEngine'

const S1_PHASE = 0.14
const S2_PHASE = 0.46
const S3_PHASE = 0.58
const S4_PHASE = 0.09

class HeartSoundsEngine {
  constructor() {
    this.enabled = false
    this.ctx = null
    this.master = null
    this.noiseBuf = null
    this.stopFn = null
    this._prevPhase = 0
    this._listeners = new Set()
  }

  /* ── public API ─────────────────────────────────────────────────────── */
  setEnabled(on) {
    if (on === this.enabled) return
    if (on) {
      this._ensureCtx()
      this.enabled = true
      this.ctx.resume?.()
      this._startLoop()
    } else {
      this.enabled = false
      this._stopLoop()
      this.ctx?.suspend?.()
    }
    this._emit()
  }

  isEnabled() { return this.enabled }

  /** UI chips subscribe: fn(enabled, soundId|null) */
  onSound(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn) }

  _emit() { this._listeners.forEach(fn => { try { fn(this.enabled) } catch { /* noop */ } }) }

  /* ── internals ───────────────────────────────────────────────────────── */
  _ensureCtx() {
    if (this.ctx) return
    const AC = window.AudioContext || window.webkitAudioContext
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.5
    this.master.connect(this.ctx.destination)

    // shared 2 s pink-ish noise buffer (murmurs / valve clicks)
    const len = Math.floor(this.ctx.sampleRate * 2)
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = this.noiseBuf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < len; i++) {          // cheap pink noise (Paul Kellet)
      const w = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.0990460
      b1 = 0.96300 * b1 + w * 0.2965164
      b2 = 0.57000 * b2 + w * 1.0526913
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16
    }
  }

  _thump({ freq, decay, gain, noise = 0.25, nFreq = 160, q = 1.4 }) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    // low thump: two detuned sines through a fast-decay envelope
    ;[freq, freq * 1.5].forEach((f, i) => {
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(f, t)
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + decay)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(gain * (i ? 0.45 : 1), t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
      o.connect(g).connect(this.master)
      o.start(t); o.stop(t + decay + 0.05)
    })
    // valve click: short band-passed noise
    const n = this.ctx.createBufferSource()
    n.buffer = this.noiseBuf
    n.loop = true
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'; bp.frequency.value = nFreq; bp.Q.value = q
    const ng = this.ctx.createGain()
    ng.gain.setValueAtTime(0.0001, t)
    ng.gain.exponentialRampToValueAtTime(gain * noise, t + 0.008)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    n.connect(bp).connect(ng).connect(this.master)
    n.start(t); n.stop(t + 0.08)
  }

  _murmur(duration, freq, q, gain) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const n = this.ctx.createBufferSource()
    n.buffer = this.noiseBuf
    n.loop = true
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + duration * 0.35)  // crescendo
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)       // decrescendo
    n.connect(bp).connect(g).connect(this.master)
    n.start(t); n.stop(t + duration + 0.05)
  }

  _startLoop() {
    this._prevPhase = getEngineState().phase
    this.stopFn = onEngineFrame(s => {
      if (!this.enabled) return
      const p = s.phase
      const crossed = mark => this._prevPhase < mark && p >= mark

      if (crossed(S1_PHASE)) {
        this._thump({ freq: 55, decay: 0.13, gain: 0.9, noise: 0.3, nFreq: 140 })
        this._event('S1')
        // aortic stenosis murmur rides S1→S2 (systolic ejection)
        if (s.valve < 70) {
          this._murmur((S2_PHASE - S1_PHASE) * (60 / s.bpm), 165, 1.1, 0.34)
          this._event('AS-murmur')
        }
      }
      if (crossed(S2_PHASE)) {
        this._thump({ freq: 72, decay: 0.07, gain: 0.55, noise: 0.5, nFreq: 380, q: 2 })
        this._event('S2')
      }
      if (crossed(S3_PHASE) && s.contractility < 40) {
        this._thump({ freq: 42, decay: 0.16, gain: 0.4, noise: 0.12, nFreq: 90 })
        this._event('S3')
      }
      if (crossed(S4_PHASE) && (s.afterload > 75 || s.infarct > 40)) {
        this._thump({ freq: 38, decay: 0.14, gain: 0.38, noise: 0.10, nFreq: 80 })
        this._event('S4')
      }
      this._prevPhase = p
    })
  }

  _event(id) {
    this._listeners.forEach(fn => { try { fn(this.enabled, id) } catch { /* noop */ } })
  }

  _stopLoop() { this.stopFn?.(); this.stopFn = null }
}

const heartSounds = new HeartSoundsEngine()
export default heartSounds
export { S1_PHASE, S2_PHASE, S3_PHASE, S4_PHASE }