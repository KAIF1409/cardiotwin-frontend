/**
 * anatomyRegistry.js  —  SHARED ANATOMICAL GEOMETRY SOURCE OF TRUTH
 * ══════════════════════════════════════════════════════════════════
 * Single declaration point for every vessel / chamber path, radius,
 * circuit ownership and camera-focus metadata in the 3-D scene.
 *
 * WHY A REGISTRY?
 *   VascularSystem renders  THREE.TubeGeometry      from these points
 *   BloodFlowParticles rides THREE.CatmullRomCurve3 from THE SAME points
 *   → particles are anatomically LOCKED inside the vessel walls by
 *     construction, never floating free of their tubes.
 *
 * FRAME CONVENTIONS (matches HeartLabels.jsx anchors):
 *   • Heart normalised to ~2 units tall, centred on origin.
 *   • Viewer-left  (x < 0) = patient LEFT  (LA · LV · systemic)
 *   • Viewer-right (x > 0) = patient RIGHT (RA · RV · pulmonary)
 *   • Anterior = +z (sternum side) · Posterior = −z (spine side)
 */

import * as THREE from 'three'

// ── Helpers ──────────────────────────────────────────────────────────────────
const V = pts => pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))

const _curveCache = new Map()
/** Arc-length parameterised curve for a path id (cached, zero realloc). */
export function getPathCurve(id) {
  let c = _curveCache.get(id)
  if (!c) {
    c = new THREE.CatmullRomCurve3(PATHS[id].pts, false, 'centripetal')
    _curveCache.set(id, c)
  }
  return c
}

export const FLOW_STYLE = {
  O2_COLOR:   '#FF0033',   // oxygenated — vivid crimson (spec)
  DE_COLOR:   '#0055FF',   // deoxygenated — deep cobalt (spec)
  CORE_COUNT: { systemic: 240, pulmonary: 210 },   // glow cores per circuit
  HALO_ALPHA: 0.16,        // additive halo shell opacity
  EDGE_FADE:  0.045,       // portion of journey where heads/tails fade in-out
}

// ── Hover/focus bus (imperative, zero-react for 60 fps safety) ───────────────
// Any component may write `.focusId`; BloodFlowParticles reads it per frame to
// brighten + accelerate the highlighted circuit — no React state involved.
export const flowBus = { focusId: null }

const CIRCUIT_OF_ID = {}
/** Map a hovered registry/label id → owning circuit (null if unrelated). */
export function circuitForId(id) {
  const key = String(id || '').toUpperCase()
  if (CIRCUIT_OF_ID[key] !== undefined) return CIRCUIT_OF_ID[key]
  return null
}


// ═════════════════════════════════════════════════════════════════════════════
// VASCULAR TREE  —  great vessels + coronaries
// ─────────────────────────────────────────────────────────────────────────────
export const PATHS = {
  // ── Systemic venous return (blue → right atrium) ──────────────────────────
  SVC: {
    id: 'SVC', flowOnly: false,
    fullName: 'Superior Vena Cava', short: 'SVC',
    info: 'Returns deoxygenated blood from head, neck and arms to the right atrium.',
    color: '#5f63b8',        // venous tissue violet-blue
    circuit: 'pulmonary',
    radius: 0.052,
    pts: V([[0.42, 1.34, -0.34], [0.40, 1.04, -0.30], [0.34, 0.74, -0.14], [0.30, 0.50, -0.01]]),
    marker: { normal: [0.55, 0.75, 0.35] },
  },
  IVC: {
    id: 'IVC', flowOnly: false,
    fullName: 'Inferior Vena Cava', short: 'IVC',
    info: 'Drains deoxygenated blood from the abdomen, pelvis and legs upward to the right atrium.',
    color: '#5f63b8',
    circuit: 'pulmonary',
    radius: 0.058,
    pts: V([[0.47, -1.32, -0.30], [0.45, -1.00, -0.22], [0.39, -0.62, -0.10], [0.33, -0.30, 0.00]]),
    marker: { normal: [0.6, -0.6, 0.5] },
  },

  // ── Pulmonary arteries (blue, RV → lungs) ─────────────────────────────────
  PA_TRUNK: {
    id: 'PAT', flowOnly: false,
    fullName: 'Pulmonary Artery Trunk', short: 'PA',
    info: 'Carries deoxygenated blood from the right ventricle toward the lungs.',
    color: '#7b57c9',
    circuit: 'pulmonary',
    radius: 0.062,
    pts: V([[0.21, -0.30, 0.12], [0.19, 0.02, 0.15], [0.175, 0.30, 0.155], [0.155, 0.54, 0.09], [0.135, 0.67, 0.01]]),
    marker: { normal: [0.35, 1, 0.4] },
  },
  PA_LEFT: {
    id: 'PAL', flowOnly: false,
    fullName: 'Left Pulmonary Artery', short: 'LPA',
    info: 'Left branch carrying deoxygenated blood to the left lung.',
    color: '#7b57c9',
    circuit: 'pulmonary',
    radius: 0.045,
    pts: V([[0.125, 0.68, 0.0], [0.06, 0.78, -0.10], [-0.18, 0.93, -0.26], [-0.38, 1.02, -0.38]]),
    marker: { normal: [-0.35, 0.8, 0.2] },
  },
  PA_RIGHT: {
    id: 'PAR', flowOnly: false,
    fullName: 'Right Pulmonary Artery', short: 'RPA',
    info: 'Right branch carrying deoxygenated blood to the right lung.',
    color: '#7b57c9',
    circuit: 'pulmonary',
    radius: 0.045,
    pts: V([[0.145, 0.69, 0.0], [0.32, 0.82, -0.10], [0.50, 0.97, -0.22], [0.64, 1.10, -0.30]]),
    marker: { normal: [0.55, 0.8, 0.2] },
  },

  // ── Pulmonary veins (red, lungs → left atrium) ────────────────────────────
  PV_L: {
    id: 'PVL', flowOnly: false,
    fullName: 'Left Pulmonary Veins', short: 'PV',
    info: 'Return freshly-oxygenated blood from the left lung to the left atrium.',
    color: '#c14040',
    circuit: 'systemic',
    radius: 0.044,
    pts: V([[-0.44, 1.04, -0.34], [-0.37, 0.83, -0.26], [-0.315, 0.62, -0.16]]),
    marker: { normal: [-0.5, 0.8, -0.1] },
  },
  PV_R: {
    id: 'PVR', flowOnly: false,
    fullName: 'Right Pulmonary Veins', short: 'PV',
    info: 'Return freshly-oxygenated blood from the right lung to the left atrium.',
    color: '#c14040',
    circuit: 'systemic',
    radius: 0.044,
    pts: V([[-0.54, 0.76, -0.40], [-0.42, 0.65, -0.28], [-0.31, 0.53, -0.18]]),
    marker: { normal: [-0.6, 0.5, -0.2] },
  },

  // ── Aorta — one continuous trunk: root → ascending → arch → descending ────
  AORTA: {
    id: 'AO', flowOnly: false,
    fullName: 'Aorta (Ascending · Arch · Descending)', short: 'AO',
    info: 'The great elastic artery — delivers oxygenated blood from the left ventricle to the entire body.',
    color: '#b83232',
    circuit: 'systemic',
    radius: 0.072,
    pts: V([
      [-0.165, -0.34, 0.105],   // LVOT
      [-0.15, 0.00, 0.085],
      [-0.125, 0.26, 0.07],
      [-0.095, 0.50, 0.04],     // ascending
      [-0.06, 0.70, 0.01],
      [-0.02, 0.92, -0.05],     // arch apex
      [-0.09, 0.96, -0.36],     // arch curving posteriorly
      [-0.16, 0.84, -0.62],
      [-0.205, 0.62, -0.75],    // isthmus → descending
      [-0.225, 0.20, -0.79],
      [-0.24, -0.42, -0.80],
      [-0.255, -1.16, -0.78],   // through diaphragm
    ]),
    marker: { normal: [-0.3, 1, 0.35] },
  },

  // ── Coronary circulation (fed from aortic root, hug epicardial surface) ───
  COR_LAD: {
    id: 'LAD', flowOnly: false,
    fullName: 'Left Anterior Descending Artery', short: 'LAD',
    info: "The heart's own supply down the anterior interventricular groove — 'widow-maker' when occluded.",
    color: '#d94a4a',
    circuit: 'systemic',
    radius: 0.026,
    pts: V([
      [-0.10, 0.47, 0.16],      // left aortic sinus
      [-0.075, 0.30, 0.36],
      [-0.045, 0.06, 0.45],     // anterior groove
      [-0.010, -0.18, 0.46],
      [0.025, -0.44, 0.36],     // toward apex
      [0.045, -0.60, 0.22],     // wraps the apex tip
    ]),
    marker: { normal: [-0.15, 0.2, 1] },
  },
  COR_DIA: {
    id: 'DIA', flowOnly: false,
    fullName: 'Diagonal Branch', short: 'DIA',
    info: 'Diagonal coronary branch spreading across the antero-lateral left-ventricular wall.',
    color: '#d94a4a',
    circuit: 'systemic',
    radius: 0.020,
    pts: V([
      [-0.05, 0.05, 0.455],
      [-0.24, -0.02, 0.40],
      [-0.42, -0.16, 0.28],
      [-0.52, -0.34, 0.12],
    ]),
    marker: { normal: [-0.8, 0.1, 0.55] },
  },
  COR_RCA: {
    id: 'RCA', flowOnly: false,
    fullName: 'Right Coronary Artery', short: 'RCA',
    info: 'Supplies the right heart and inferior wall — dominant in 80% of people.',
    color: '#d94a4a',
    circuit: 'systemic',
    radius: 0.024,
    pts: V([
      [-0.03, 0.45, 0.19],      // right aortic sinus
      [0.16, 0.37, 0.30],       // right AV groove
      [0.33, 0.16, 0.40],
      [0.36, -0.10, 0.43],
      [0.30, -0.36, 0.40],      // acute margin
      [0.12, -0.52, 0.24],      // crux region
    ]),
    marker: { normal: [0.85, 0.1, 0.5] },
  },

  // ── Internal flow-only channels (particles ride these; NO outer mesh) ─────
  CH_RA_RV: {
    id: 'TRIC', flowOnly: true,
    fullName: 'Tricuspid Inflow', short: 'RA→RV',
    info: 'Deoxygenated blood crossing the tricuspid valve into the right ventricle.',
    color: '#0055FF',
    circuit: 'pulmonary',
    radius: 0.001,
    pts: V([[0.305, 0.44, 0.01], [0.28, 0.16, 0.08], [0.245, -0.08, 0.11], [0.215, -0.28, 0.115]]),
    marker: null,
  },
  CH_LA_LV: {
    id: 'MITRAL', flowOnly: true,
    fullName: 'Mitral Inflow', short: 'LA→LV',
    info: 'Oxygenated blood crossing the mitral valve into the left ventricle.',
    color: '#FF0033',
    circuit: 'systemic',
    radius: 0.001,
    pts: V([[-0.295, 0.44, -0.115], [-0.245, 0.18, -0.02], [-0.20, -0.06, 0.05], [-0.175, -0.32, 0.095]]),
    marker: null,
  },
}

/** Ordered route of each full circulation journey (registry ids chained). */
export const JOURNEYS = {
  systemic:  ['PVL', 'PVR', 'MITRAL', 'AO'],
  pulmonary: ['SVC', 'IVC', 'TRIC', 'PAT', 'PAL', 'PAR'],
}

// ═════════════════════════════════════════════════════════════════════════════
// CAMERA-FOCUS MARKERS  (chips / click targets — mirrors ANATOMY_MARKERS shape)
// ═════════════════════════════════════════════════════════════════════════════
function markerFromPath(p) {
  const n = p.pts.length
  const iMid = Math.max(1, Math.floor(n / 2))
  const mid  = p.pts[iMid].clone().lerp(p.pts[iMid - 1], 0.5)
  return {
    id: p.id, fullName: p.fullName, color: p.color, desc: p.info,
    pos: mid,
    normal: new THREE.Vector3(...p.marker.normal).normalize(),
  }
}

/** Focusable vascular markers (only real meshes, not flow-only channels). */
export const VESSEL_MARKERS =
  Object.values(PATHS)
    .filter(p => !p.flowOnly && p.marker)
    .map(markerFromPath)

const RIB_LEVELS = [
  { y:  0.86, w: 0.78, frontZ: 0.56, tipX: 0.30, len: 0.72, thick: 0.040 },
  { y:  0.62, w: 0.95, frontZ: 0.64, tipX: 0.26, len: 0.90, thick: 0.043 },
  { y:  0.38, w: 1.05, frontZ: 0.68, tipX: 0.20, len: 1.00, thick: 0.045 },
  { y:  0.14, w: 1.10, frontZ: 0.70, tipX: 0.14, len: 1.04, thick: 0.046 },
  { y: -0.10, w: 1.12, frontZ: 0.69, tipX: 0.08, len: 1.02, thick: 0.046 },
  { y: -0.34, w: 1.09, frontZ: 0.66, tipX: 0.04, len: 0.96, thick: 0.044 },
  { y: -0.57, w: 1.02, frontZ: 0.61, tipX: 0.02, len: 0.86, thick: 0.042 },
  { y: -0.79, w: 0.93, frontZ: 0.55, tipX: 0.00, len: 0.74, thick: 0.040 },
  { y: -1.00, w: 0.83, frontZ: 0.47, tipX: 0.00, len: 0.62, thick: 0.038 },
  { y: -1.20, w: 0.71, frontZ: 0.38, tipX: 0.00, len: 0.50, thick: 0.035 },
  { y: -1.39, w: 0.58, frontZ: 0.29, tipX: 0.00, len: 0.38, thick: 0.032 },
  { y: -1.56, w: 0.45, frontZ: 0.21, tipX: 0.00, len: 0.28, thick: 0.030 }, // floating
]

/**
 * Procedural THORACIC SKELETON descriptors.
 * Generated once at module load: 12 rib pairs (+ costal cartilage), sternum,
 * thoracic spine T1–T12 and clavicles. Every bone registers a camera marker so
 * clicking tweens onto it — full Phase-1 interactivity contract.
 */
export function buildThorax() {
  const bones = []

  const ORD = n => n + (['th','st','nd','rd'][((n % 100) - 20) % 10] || ['th','st','nd','rd'][n] || 'th')

  // ── Rib pairs: posterior spine → lateral barrel → anterior cartilage ───────
  RIB_LEVELS.forEach((L, ix) => {
    const num = ix + 1
    ;['L', 'R'].forEach(side => {
      const s = side === 'L' ? -1 : 1
      const spinePt  = [s * 0.10, L.y, -0.80]
      const lateral  = [s * L.w * 0.72, L.y - 0.06 * L.len, -0.12]
      const widest   = [s * L.w, L.y - 0.14 * L.len, 0.18]
      const antLat   = [s * (L.w - 0.24), L.y - 0.22 * L.len, L.frontZ]
      const cartTip  = [s * L.tipX, L.y - 0.28 * L.len, L.frontZ + 0.03]
      const trueRib  = num <= 7
      const floating = num >= 11
      const fullName = `${side === 'L' ? 'Left' : 'Right'} ${ORD(num)} ${floating ? 'Rib (floating)' : 'Rib'}`
      const mid      = new THREE.Vector3(
        s * L.w * 0.86, L.y - 0.16 * L.len, (widest[2] + antLat[2]) / 2)

      bones.push({
        kind: 'rib', id: `rib_${side}_${num}`, fullName,
        info: trueRib
          ? 'True rib — its costal cartilage anchors directly to the sternum, shielding the heart.'
          : floating
            ? 'Floating rib — articulates with the vertebrae only.'
            : 'False rib — joins the cage indirectly via cartilage above.',
        curve: new THREE.CatmullRomCurve3(V([spinePt, lateral, widest, antLat])),
        cartilagePts: trueRib
          ? V([antLat,
               [(antLat[0] + cartTip[0]) / 2, (antLat[1] + cartTip[1]) / 2 - 0.01, cartTip[2]],
               cartTip])
          : null,
        radius: L.thick,
        cartRadius: L.thick * 0.78,
        marker: {
          id: `rib_${side}_${num}`, fullName, color: '#E8E2D0',
          pos: mid,
          normal: new THREE.Vector3(mid.x * 0.9, mid.y * 0.15, 0.65 + mid.z * 0.2).normalize(),
          desc: 'Thoracic cage element — the protective bony frame housing the cardiac cavity.',
        },
      })
    })
  })

  // ── Sternum (manubrium · body · xiphoid) ───────────────────────────────────
  const STERNUM = [
    { y: 0.80, h: 0.30, w: 0.30, d: 0.075, id: 'manubrium', name: 'Manubrium' },
    { y: 0.26, h: 0.82, w: 0.24, d: 0.065, id: 'sternum_body', name: 'Sternal Body' },
    { y: -0.40, h: 0.26, w: 0.14, d: 0.055, id: 'xiphoid', name: 'Xiphoid Process' },
  ]
  STERNUM.forEach(S => {
    bones.push({
      kind: 'sternum', id: S.id, fullName: S.name,
      info: 'Anterior breastplate — midline fusion point of the costal cartilages guarding the heart.',
      box: { pos: [0, S.y, 0.70], size: [S.w, S.h, S.d] },
      marker: {
        id: S.id, fullName: S.name, color: '#F2EDDC',
        pos: new THREE.Vector3(0, S.y, 0.74),
        normal: new THREE.Vector3(0, 0.12, 1).normalize(),
        desc: 'Anterior thoracic wall protecting the mediastinum.',
      },
    })
  })

  // ── Thoracic spine T1–T12 ─────────────────────────────────────────────────
  for (let i = 0; i < 12; i++) {
    const seg = i + 1
    const y   = 0.90 - i * 0.215
    bones.push({
      kind: 'vertebra', id: `T${seg}`, fullName: `Vertebra T${seg}`,
      info: 'Thoracic vertebra — a load-bearing guard rail of the posterior chest wall.',
      pos: [0, y, -0.84],
      discY: y - 0.1075,
      marker: {
        id: `T${seg}`, fullName: `T${seg} Vertebra`, color: '#DDE7FF',
        pos: new THREE.Vector3(0, y, -0.92),
        normal: new THREE.Vector3(0, 0.15, -1).normalize(),
        desc: 'Thoracic vertebral segment of the spinal column.',
      },
    })
  }

  // ── Clavicles ──────────────────────────────────────────────────────────────
  ;['L', 'R'].forEach(side => {
    const s = side === 'L' ? -1 : 1
    bones.push({
      kind: 'clavicle', id: `clav_${side}`,
      fullName: `${side === 'L' ? 'Left' : 'Right'} Clavicle`,
      info: 'Collarbone — strut linking the shoulder girdle to the sternum.',
      curve: new THREE.CatmullRomCurve3(V([
        [s * 0.20, 1.02, 0.66], [s * 0.55, 1.06, 0.58],
        [s * 0.88, 1.02, 0.44], [s * 1.05, 0.98, 0.26],
      ])),
      radius: 0.052,
      marker: {
        id: `clav_${side}`,
        fullName: `${side === 'L' ? 'Left' : 'Right'} Clavicle`,
        color: '#EFE9D8',
        pos: new THREE.Vector3(s * 0.62, 1.03, 0.51),
        normal: new THREE.Vector3(s * 0.5, 0.5, 0.7).normalize(),
        desc: 'Clavicle — superior bony strut of the thoracic inlet.',
      },
    })
  })

  return bones
}


