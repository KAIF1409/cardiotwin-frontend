import { useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// DATA — Each top-level preset can have `subcategories`. Each sub has full
// parameter values (drives ECG, PV loop, strain, sliders) + cause/effect info.
// ─────────────────────────────────────────────────────────────────────────────

const presets = [
  {
    label: '✅ Normal',
    color: '#00e676',
    icon: '✅',
    description: 'Healthy heart. EF > 55%',
    values: {
      Preload: 50, Afterload: 50, Contractility: 60,
      'Infarct %': 0, 'Valve Area': 100,
    },
    cause: 'Normal cardiac physiology. All chambers functioning within optimal range.',
    effect: 'EF 55–70%, normal sinus rhythm, symmetric PV loop, GLS ≥ −18%.',
    metrics: { ef: '60–70%', hr: '60–80 bpm', gls: '−20%', pvPattern: 'Normal rectangle', ecgPattern: 'Normal sinus' },
  },

  // ── HEART FAILURE with subcategories ────────────────────────────────────
  {
    label: '❤️‍🩹 Heart Failure',
    color: '#ef5350',
    icon: '❤️‍🩹',
    description: 'Reduced pump function — multiple subtypes',
    hasSubcategories: true,
    subcategories: [
      {
        label: 'DCM — Dilated Cardiomyopathy',
        short: 'DCM',
        color: '#ef5350',
        cause: 'Idiopathic or viral myocarditis causes diffuse myocyte injury → ventricle dilates and thins. Preload rises as the LV stretches to maintain output.',
        effect: 'Severely reduced EF (15–35%), wide dilated PV loop, LBBB on ECG, global GLS worse than −10%, high BNP.',
        values: { Preload: 85, Afterload: 65, Contractility: 18, 'Infarct %': 50, 'Valve Area': 90 },
        metrics: { ef: '15–30%', hr: '90–110 bpm', gls: '−8 to −10%', pvPattern: 'Wide dilated loop', ecgPattern: 'LBBB, prolonged QRS' },
        tags: ['EF ↓↓', 'Dilated LV', 'LBBB', 'High BNP'],
      },
      {
        label: 'HCM — Hypertrophic Cardiomyopathy',
        short: 'HCM',
        color: '#ff7043',
        cause: 'Sarcomere gene mutation (MYH7, MYBPC3) → abnormal myocyte hypertrophy, fibrosis, and disarray. Diastolic dysfunction worsens despite preserved systolic EF.',
        effect: 'Preserved or elevated EF, small LV cavity, LVOT obstruction gradient, dynamic SAM on echo. Risk of sudden cardiac death.',
        values: { Preload: 40, Afterload: 70, Contractility: 75, 'Infarct %': 10, 'Valve Area': 55 },
        metrics: { ef: '65–75%', hr: '75–100 bpm', gls: '−14 to −16%', pvPattern: 'Narrow steep loop', ecgPattern: 'LVH pattern, ST changes' },
        tags: ['HFpEF', 'LVOT obstruction', 'Sudden death risk', 'Diastolic dysfunction'],
      },
      {
        label: 'ICM — Ischemic Cardiomyopathy',
        short: 'ICM',
        color: '#e53935',
        cause: 'Chronic CAD → repeated ischemia and infarction → regional wall motion abnormalities and scar tissue replacing viable myocardium.',
        effect: 'Moderate-to-severe EF reduction (25–45%), regional GLS abnormalities, Q-waves in infarcted territory, segmental PV loop distortion.',
        values: { Preload: 70, Afterload: 72, Contractility: 28, 'Infarct %': 65, 'Valve Area': 88 },
        metrics: { ef: '25–45%', hr: '80–100 bpm', gls: '−10 to −14%', pvPattern: 'Distorted segmental loop', ecgPattern: 'Q waves, ST depression' },
        tags: ['CAD', 'Regional WMA', 'Q-waves', 'Scar tissue'],
      },
      {
        label: 'HFpEF — Preserved Ejection Fraction',
        short: 'HFpEF',
        color: '#c62828',
        cause: 'Hypertension, obesity, diabetes → concentric LV remodelling → impaired relaxation (↑ LV stiffness). EF appears normal but filling pressures are elevated.',
        effect: 'EF > 50% but exercise intolerance, elevated E/e′ ratio, diastolic dysfunction grade II–III, elevated PCWP.',
        values: { Preload: 72, Afterload: 82, Contractility: 55, 'Infarct %': 15, 'Valve Area': 95 },
        metrics: { ef: '50–60%', hr: '70–90 bpm', gls: '−16 to −18%', pvPattern: 'Tall narrow loop', ecgPattern: 'LVH, ST changes' },
        tags: ['Preserved EF', 'Diastolic HF', 'Elevated PCWP', 'Concentric LVH'],
      },
      {
        label: 'PPCM — Peripartum Cardiomyopathy',
        short: 'PPCM',
        color: '#b71c1c',
        cause: 'Abnormal prolactin cleavage (16-kDa fragment) + oxidative stress during late pregnancy/postpartum → myocardial toxicity and inflammation.',
        effect: 'New-onset HF in last trimester or ≤5 months postpartum. EF < 45%. May partially recover or progress to end-stage HF.',
        values: { Preload: 80, Afterload: 55, Contractility: 22, 'Infarct %': 35, 'Valve Area': 100 },
        metrics: { ef: '20–40%', hr: '95–115 bpm', gls: '−9 to −12%', pvPattern: 'Dilated soft loop', ecgPattern: 'Sinus tachycardia, LBBB' },
        tags: ['Postpartum', 'Prolactin toxicity', 'Reversible', 'Young women'],
      },
    ],
  },

  // ── VALVE DISEASE with subcategories ────────────────────────────────────
  {
    label: '🫀 Valve Stenosis',
    color: '#ff9800',
    icon: '🫀',
    description: 'Narrowed or leaking valves — multiple subtypes',
    hasSubcategories: true,
    subcategories: [
      {
        label: 'AS — Aortic Stenosis',
        short: 'AS',
        color: '#ff9800',
        cause: 'Calcific degeneration (elderly) or bicuspid aortic valve → progressive leaflet thickening → fixed LVOT obstruction. LV pressure overload causes concentric hypertrophy.',
        effect: 'Slow-rising pulse, syncope on exertion, angina, dyspnoea. Gradient >40 mmHg = severe. EF preserved until late.',
        values: { Preload: 58, Afterload: 90, Contractility: 48, 'Infarct %': 0, 'Valve Area': 30 },
        metrics: { ef: '50–65%', hr: '65–80 bpm', gls: '−14 to −17%', pvPattern: 'Tall narrow loop', ecgPattern: 'LVH, ST-T changes' },
        tags: ['Pressure overload', 'Concentric LVH', 'Systolic murmur', 'AVR indicated'],
      },
      {
        label: 'MR — Mitral Regurgitation',
        short: 'MR',
        color: '#ffa726',
        cause: 'MVP, rheumatic disease, or chordae rupture → incompetent mitral valve → volume overload on LV. Regurgitant fraction enters LA, causing LA dilatation and pulmonary congestion.',
        effect: 'Eccentric LV hypertrophy, pansystolic murmur, AF risk, elevated pulmonary pressures. EF appears preserved initially.',
        values: { Preload: 80, Afterload: 45, Contractility: 52, 'Infarct %': 0, 'Valve Area': 55 },
        metrics: { ef: '55–70%', hr: '70–95 bpm', gls: '−16 to −19%', pvPattern: 'Wide eccentric loop', ecgPattern: 'AF, P-mitrale' },
        tags: ['Volume overload', 'LA dilatation', 'AF risk', 'Holosystolic murmur'],
      },
      {
        label: 'MS — Mitral Stenosis',
        short: 'MS',
        color: '#ef6c00',
        cause: 'Rheumatic fever → mitral leaflet fusion and thickening → fixed mitral obstruction. Left atrial pressure rises, causing LA dilatation and pulmonary hypertension.',
        effect: 'Low diastolic gradient, malar flush, rumbling diastolic murmur, AF, pulmonary oedema on exertion. MVA < 1.5 cm² = severe.',
        values: { Preload: 35, Afterload: 70, Contractility: 50, 'Infarct %': 0, 'Valve Area': 35 },
        metrics: { ef: '55–65%', hr: '75–100 bpm (AF)', gls: '−17 to −20%', pvPattern: 'Narrow starved loop', ecgPattern: 'AF, P-mitrale' },
        tags: ['Rheumatic', 'LA dilatation', 'Pulmonary HTN', 'Diastolic murmur'],
      },
      {
        label: 'AR — Aortic Regurgitation',
        short: 'AR',
        color: '#e65100',
        cause: 'Aortic root dilatation (Marfan, bicuspid) or leaflet disease → regurgitant flow from aorta into LV in diastole → volume overload and eccentric LV dilatation.',
        effect: 'Wide pulse pressure, collapsing (water-hammer) pulse, Austin Flint murmur. EF may appear preserved but afterload mismatch worsens with time.',
        values: { Preload: 85, Afterload: 35, Contractility: 55, 'Infarct %': 0, 'Valve Area': 60 },
        metrics: { ef: '50–65%', hr: '60–85 bpm', gls: '−15 to −18%', pvPattern: 'Large eccentric loop', ecgPattern: 'LVH, diastolic overload' },
        tags: ['Volume overload', 'Wide pulse pressure', 'Eccentric LVH', 'Marfan risk'],
      },
    ],
  },

  // ── ATHLETE HEART ────────────────────────────────────────────────────────
  {
    label: '⚡ Athlete Heart',
    color: '#00bcd4',
    icon: '⚡',
    description: 'Physiologic adaptation — high-performance cardiac remodelling',
    hasSubcategories: true,
    subcategories: [
      {
        label: 'Endurance Athlete (e.g. Cyclist)',
        short: 'Endurance',
        color: '#00bcd4',
        cause: 'Sustained aerobic training → volume overload adaptation → eccentric LV hypertrophy, increased chamber size, and enhanced diastolic filling. Vagal tone causes resting bradycardia.',
        effect: 'EF > 65%, resting HR 40–55 bpm, increased stroke volume, superior GLS. All findings are physiologic and reversible.',
        values: { Preload: 85, Afterload: 28, Contractility: 92, 'Infarct %': 0, 'Valve Area': 100 },
        metrics: { ef: '65–75%', hr: '40–55 bpm', gls: '−22 to −25%', pvPattern: 'Large wide loop', ecgPattern: 'Sinus brady, early repol' },
        tags: ['Eccentric LVH', 'High SV', 'Bradycardia', 'Physiologic'],
      },
      {
        label: 'Strength Athlete (e.g. Weightlifter)',
        short: 'Strength',
        color: '#26c6da',
        cause: 'Isometric training → pressure overload adaptation → concentric LV hypertrophy, increased wall thickness with relatively normal cavity size.',
        effect: 'EF preserved, normal HR, increased LV wall thickness. Must distinguish from HCM — wall thickness rarely >15 mm in athletes.',
        values: { Preload: 65, Afterload: 55, Contractility: 82, 'Infarct %': 0, 'Valve Area': 100 },
        metrics: { ef: '60–70%', hr: '55–70 bpm', gls: '−20 to −23%', pvPattern: 'Normal-large loop', ecgPattern: 'LVH voltage, early repol' },
        tags: ['Concentric LVH', 'Wall thickness ↑', 'Normal EF', 'HCM mimic'],
      },
    ],
  },

  // ── MYOCARDIAL INFARCTION with subcategories ─────────────────────────────
  {
    label: '🔴 Myocardial Infarction',
    color: '#b71c1c',
    icon: '🔴',
    description: 'Acute or chronic coronary occlusion — territory dependent',
    hasSubcategories: true,
    subcategories: [
      {
        label: 'STEMI — Anterior (LAD)',
        short: 'Ant. STEMI',
        color: '#b71c1c',
        cause: 'Occlusion of LAD (left anterior descending) → anterior wall + septum ischaemia → large territory infarction. Highest mortality MI pattern.',
        effect: 'Severe EF reduction, ST elevation V1–V4, anterior wall akinesis, high risk of cardiogenic shock and VF. Q-waves develop within hours.',
        values: { Preload: 70, Afterload: 68, Contractility: 22, 'Infarct %': 75, 'Valve Area': 90 },
        metrics: { ef: '20–35%', hr: '90–120 bpm', gls: '−6 to −10%', pvPattern: 'Severely distorted', ecgPattern: 'STE V1–V4, Q-waves' },
        tags: ['LAD', 'Highest mortality', 'Cardiogenic shock risk', 'Q-waves V1–V4'],
      },
      {
        label: 'STEMI — Inferior (RCA)',
        short: 'Inf. STEMI',
        color: '#c62828',
        cause: 'Right coronary artery (RCA) occlusion → inferior wall ischaemia. Often involves RV in proximal RCA occlusions, causing RV failure and bradyarrhythmias.',
        effect: 'ST elevation in II, III, aVF. Hypotension responds to fluids. AV block common. RV MI requires distinct management (avoid nitrates).',
        values: { Preload: 65, Afterload: 60, Contractility: 38, 'Infarct %': 55, 'Valve Area': 92 },
        metrics: { ef: '35–50%', hr: '50–80 bpm (AV block)', gls: '−10 to −14%', pvPattern: 'Inferior wall distortion', ecgPattern: 'STE II/III/aVF, AV block' },
        tags: ['RCA', 'RV involvement', 'AV block', 'Avoid nitrates'],
      },
      {
        label: 'NSTEMI — Subendocardial',
        short: 'NSTEMI',
        color: '#d32f2f',
        cause: 'Partial coronary occlusion or demand ischaemia → subendocardial injury without full-thickness infarction. Troponin rises without transmural ST elevation.',
        effect: 'ST depression or T-wave inversion on ECG. EF moderately reduced. Lower immediate mortality than STEMI but recurrent ischaemia risk is high.',
        values: { Preload: 60, Afterload: 65, Contractility: 42, 'Infarct %': 35, 'Valve Area': 93 },
        metrics: { ef: '40–55%', hr: '80–105 bpm', gls: '−13 to −17%', pvPattern: 'Mild distortion', ecgPattern: 'ST depression, T-inversion' },
        tags: ['Partial occlusion', 'Troponin ↑', 'ST depression', 'No Q-waves'],
      },
      {
        label: 'Chronic MI — Old Scar',
        short: 'Chronic MI',
        color: '#e53935',
        cause: 'Remote infarction (weeks–years old) → scar tissue replaces myocardium → fixed wall motion abnormality. Hibernating myocardium may remain around scar border zone.',
        effect: 'Fixed regional WMA on echo, pathological Q-waves, ± ventricular aneurysm. Risk of VT/VF from re-entry around scar, heart failure over time.',
        values: { Preload: 67, Afterload: 70, Contractility: 32, 'Infarct %': 60, 'Valve Area': 88 },
        metrics: { ef: '30–45%', hr: '70–90 bpm', gls: '−10 to −14%', pvPattern: 'Regional fixed WMA', ecgPattern: 'Q-waves, LV aneurysm pattern' },
        tags: ['Old scar', 'Fixed WMA', 'VT risk', 'Aneurysm'],
      },
    ],
  },

  // ── ARRHYTHMIAS ──────────────────────────────────────────────────────────
  {
    label: '⚡ Arrhythmias',
    color: '#7c4dff',
    icon: '⚡',
    description: 'Electrical conduction disorders affecting heart rate & rhythm',
    hasSubcategories: true,
    subcategories: [
      {
        label: 'Atrial Fibrillation',
        short: 'AF',
        color: '#7c4dff',
        cause: 'Chaotic atrial electrical activity (multiple micro-re-entry circuits or focal triggers from pulmonary vein sleeves) → loss of coordinated atrial contraction → irregularly irregular ventricular response.',
        effect: 'Loss of atrial kick → CO drops 20–30%, especially in HFpEF. Risk of LA thrombus and embolic stroke (CHA₂DS₂-VASc). Irregular RR on ECG, absent P-waves.',
        values: { Preload: 65, Afterload: 58, Contractility: 50, 'Infarct %': 10, 'Valve Area': 90 },
        metrics: { ef: '45–60%', hr: '90–160 bpm (uncontrolled)', gls: '−14 to −18%', pvPattern: 'Variable beat-to-beat', ecgPattern: 'No P-waves, irregular RR' },
        tags: ['No P-waves', 'Stroke risk', 'Irregular rhythm', 'Rate control'],
      },
      {
        label: 'Complete Heart Block (CHB)',
        short: 'CHB',
        color: '#651fff',
        cause: 'AV node or His–Purkinje system failure → P-waves and QRS complexes are completely dissociated. Escape rhythm arises from ventricle at 30–40 bpm.',
        effect: 'Severe bradycardia (30–40 bpm), Stokes–Adams attacks, haemodynamic compromise. Requires urgent pacing. Cannon A-waves in JVP.',
        values: { Preload: 60, Afterload: 55, Contractility: 45, 'Infarct %': 20, 'Valve Area': 100 },
        metrics: { ef: '40–55%', hr: '30–45 bpm', gls: '−14 to −18%', pvPattern: 'Slow wide loop', ecgPattern: 'AV dissociation, wide QRS escape' },
        tags: ['AV dissociation', 'Ventricular escape', 'Cannon A-waves', 'Pacemaker needed'],
      },
      {
        label: 'Ventricular Tachycardia (VT)',
        short: 'VT',
        color: '#aa00ff',
        cause: 'Re-entry circuit around myocardial scar or enhanced automaticity in diseased myocardium → rapid wide-complex ventricular rhythm independent of P-waves.',
        effect: 'Haemodynamic compromise if sustained (BP drops, syncope). Risk of degeneration to VF. Wide QRS > 120 ms, AV dissociation, fusion beats.',
        values: { Preload: 55, Afterload: 75, Contractility: 30, 'Infarct %': 55, 'Valve Area': 90 },
        metrics: { ef: '25–40%', hr: '150–220 bpm', gls: '−8 to −12%', pvPattern: 'Rapid irregular loop', ecgPattern: 'Wide QRS, AV dissociation' },
        tags: ['Re-entry', 'Wide QRS', 'VF risk', 'ICD indicated'],
      },
    ],
  },

  // ── PERICARDIAL DISEASE ──────────────────────────────────────────────────
  {
    label: '🫧 Pericardial Disease',
    color: '#26a69a',
    icon: '🫧',
    description: 'Pericardium inflammation or tamponade physiology',
    hasSubcategories: true,
    subcategories: [
      {
        label: 'Cardiac Tamponade',
        short: 'Tamponade',
        color: '#26a69a',
        cause: 'Pericardial effusion accumulates faster than pericardium can stretch → external compression of all chambers → impaired filling, especially RV. Venous return becomes pressure-limited.',
        effect: "Beck's triad: hypotension + JVD + muffled heart sounds. Pulsus paradoxus > 10 mmHg. Electrical alternans on ECG. Urgent pericardiocentesis needed.",
        values: { Preload: 30, Afterload: 80, Contractility: 40, 'Infarct %': 0, 'Valve Area': 100 },
        metrics: { ef: '50–60%', hr: '110–140 bpm', gls: '−14 to −18%', pvPattern: 'Small compressed loop', ecgPattern: 'Electrical alternans, low voltage' },
        tags: ["Beck's triad", 'Pulsus paradoxus', 'Electrical alternans', 'Emergency'],
      },
      {
        label: 'Constrictive Pericarditis',
        short: 'Constrictive',
        color: '#00897b',
        cause: 'Chronic pericardial inflammation (TB, post-viral, post-surgical) → fibrous scarring → rigid pericardium. All chambers share a fixed total volume → ventricular interdependence.',
        effect: 'Kussmaul sign (JVP rises on inspiration), pericardial knock, dip-and-plateau (square root sign) on catheter, equalization of diastolic pressures.',
        values: { Preload: 68, Afterload: 65, Contractility: 48, 'Infarct %': 0, 'Valve Area': 95 },
        metrics: { ef: '50–65%', hr: '75–95 bpm', gls: '−14 to −17%', pvPattern: 'Restricted diastolic filling', ecgPattern: 'Low voltage, AF common' },
        tags: ['TB aetiology', 'Kussmaul sign', 'Pericardial knock', 'Square root sign'],
      },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// STYLES — compact, sidebar-optimised (~190px wide left panel)
// ─────────────────────────────────────────────────────────────────────────────
const styles = `
  .dp-root { display:flex; flex-direction:column; gap:3px; }

  /* ── Top-level button ── */
  .dp-top-btn {
    width:100%; background:rgba(255,255,255,0.02);
    border:1px solid rgba(255,255,255,0.07);
    border-radius:7px; cursor:pointer; padding:0;
    overflow:hidden; text-align:left;
    transition:border-color 0.18s, background 0.18s;
  }
  .dp-top-btn:hover {
    background:rgba(255,255,255,0.05);
    border-color:rgba(255,255,255,0.16);
  }
  .dp-top-btn.active-simple {
    border-color:var(--ac);
    background:color-mix(in srgb,var(--ac) 10%,transparent);
    box-shadow:0 0 10px color-mix(in srgb,var(--ac) 22%,transparent);
  }
  .dp-top-btn.expanded { border-color:rgba(255,255,255,0.18); }

  /* icon + label + chevron — all on ONE row, no wrapping */
  .dp-top-header {
    display:flex; align-items:center; gap:6px;
    padding:6px 8px; min-height:0;
  }
  .dp-top-icon {
    font-size:13px; flex-shrink:0; line-height:1;
    width:18px; text-align:center;
  }
  .dp-top-label {
    flex:1; font-size:11px; font-weight:700;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    line-height:1;
  }
  .dp-active-badge {
    font-size:7px; font-weight:800; letter-spacing:0.07em;
    padding:1px 4px; border-radius:3px; color:#000; flex-shrink:0;
  }
  .dp-chevron {
    font-size:8px; opacity:0.4; flex-shrink:0;
    transition:transform 0.2s; line-height:1;
  }
  .dp-chevron.open { transform:rotate(180deg); opacity:0.7; }

  /* ── Sub-category drawer ── */
  .dp-sub-list {
    display:none; flex-direction:column; gap:2px;
    padding:3px 5px 5px;
    border-top:1px solid rgba(255,255,255,0.05);
  }
  .dp-sub-list.open { display:flex; animation:dp-in 0.16s ease; }
  @keyframes dp-in {
    from { opacity:0; transform:translateY(-3px); }
    to   { opacity:1; transform:translateY(0); }
  }

  /* ── Sub button ── */
  .dp-sub-btn {
    width:100%; padding:0;
    background:rgba(255,255,255,0.02);
    border:1px solid rgba(255,255,255,0.06);
    border-radius:5px; cursor:pointer; text-align:left;
    overflow:hidden;
    transition:border-color 0.14s, background 0.14s;
  }
  .dp-sub-btn:hover { background:rgba(255,255,255,0.06); }
  .dp-sub-btn.active {
    border-color:var(--ac);
    background:color-mix(in srgb,var(--ac) 10%,transparent);
    box-shadow:0 0 7px color-mix(in srgb,var(--ac) 20%,transparent);
  }

  /* dot | SHORT | long name (ellipsis) | ACTIVE badge */
  .dp-sub-header {
    display:flex; align-items:center; gap:5px;
    padding:5px 7px;
  }
  .dp-sub-dot {
    width:5px; height:5px; border-radius:50%; flex-shrink:0;
  }
  .dp-sub-short {
    font-size:9px; font-weight:800; letter-spacing:0.03em;
    flex-shrink:0; line-height:1;
  }
  .dp-sub-name {
    flex:1; font-size:9px; font-weight:500; color:#999;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .dp-sub-btn.active .dp-sub-name { color:#ccc; }
  .dp-sub-active-dot {
    width:5px; height:5px; border-radius:50%; flex-shrink:0;
    animation:dp-pulse 1s ease infinite;
  }
  @keyframes dp-pulse {
    0%,100% { opacity:1; } 50% { opacity:0.3; }
  }

  /* ── Tags row (only shown on active sub) ── */
  .dp-tags {
    display:flex; flex-wrap:wrap; gap:2px;
    padding:0 7px 5px;
  }
  .dp-tag {
    font-size:7px; padding:1px 4px; border-radius:100px;
    border:1px solid; font-weight:700; white-space:nowrap;
  }

  /* ── Info drawer (active sub) ── */
  .dp-info {
    border-top:1px solid rgba(255,255,255,0.05);
    padding:7px 8px 9px;
    background:rgba(0,0,0,0.22);
    font-size:10px; line-height:1.5; color:#bbb;
  }
  .dp-info-section { margin-bottom:6px; }
  .dp-info-section:last-child { margin-bottom:0; }
  .dp-info-pill {
    display:inline-block; font-size:7px; font-weight:800;
    letter-spacing:0.07em; text-transform:uppercase;
    padding:1px 5px; border-radius:3px; margin-bottom:3px; color:#000;
  }
  .dp-info-text { color:#bbb; font-size:9.5px; line-height:1.5; margin:0; }

  /* ── Metrics 2-col grid ── */
  .dp-metrics {
    display:grid; grid-template-columns:1fr 1fr;
    gap:3px; margin-top:6px;
  }
  .dp-metric {
    background:rgba(255,255,255,0.04);
    border:1px solid rgba(255,255,255,0.07);
    border-radius:4px; padding:4px 6px;
  }
  .dp-metric.span2 { grid-column:span 2; }
  .dp-metric-key {
    font-size:7px; opacity:0.5; display:block; margin-bottom:1px;
    text-transform:uppercase; letter-spacing:0.05em;
  }
  .dp-metric-val { font-size:9px; font-weight:700; }

  /* ── Simple-active info (Normal preset) ── */
  .dp-simple-info {
    border-top:1px solid rgba(255,255,255,0.05);
    padding:6px 8px 8px;
    background:rgba(0,0,0,0.18);
    font-size:9.5px; line-height:1.5; color:#bbb;
  }
`

let stylesInjected = false
function injectStyles() {
  if (stylesInjected) return
  stylesInjected = true
  const el = document.createElement('style')
  el.textContent = styles
  document.head.appendChild(el)
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
// Strip emoji from label text so we can render icon separately
function splitEmoji(label) {
  // Match leading emoji cluster (including ZWJ sequences like ❤️‍🩹)
  const m = label.match(/^([\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}][\uFE0F\u20D0-\u20FF]*(?:\u200D[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}][\uFE0F\u20D0-\u20FF]*)*|[\u2702-\u27B0][\uFE0F]?)\s*/u)
  if (m) return { icon: m[1], text: label.slice(m[0].length) }
  return { icon: '', text: label }
}

export default function DiseasePresets({ onSelect, active }) {
  injectStyles()

  const [expandedTop, setExpandedTop] = useState(null)

  const handleTopClick = (preset) => {
    if (preset.hasSubcategories) {
      setExpandedTop(prev => prev === preset.label ? null : preset.label)
    } else {
      setExpandedTop(null)
      onSelect?.(preset.values, preset.label)
    }
  }

  const handleSubClick = (sub) => {
    onSelect?.(sub.values, sub.label)
  }

  return (
    <div>
      <div className="dp-root">
        {presets.map(preset => {
          const isExpanded  = expandedTop === preset.label
          const isSimpleActive = !preset.hasSubcategories && active === preset.label
          const hasActiveSub = preset.hasSubcategories &&
            preset.subcategories.some(s => s.label === active)
          const { icon, text } = splitEmoji(preset.label)

          return (
            <div key={preset.label}>
              <button
                className={[
                  'dp-top-btn',
                  isSimpleActive ? 'active-simple' : '',
                  isExpanded     ? 'expanded'      : '',
                ].join(' ')}
                style={{ '--ac': preset.color }}
                onClick={() => handleTopClick(preset)}
              >
                {/* ── Single-row header ── */}
                <div className="dp-top-header">
                  <span className="dp-top-icon">{icon}</span>
                  <span className="dp-top-label" style={{ color: preset.color }}>
                    {text}
                  </span>
                  {isSimpleActive && (
                    <span className="dp-active-badge" style={{ background: preset.color }}>
                      ON
                    </span>
                  )}
                  {hasActiveSub && !isExpanded && (
                    <span className="dp-active-badge" style={{ background: preset.color }}>
                      ●
                    </span>
                  )}
                  {preset.hasSubcategories && (
                    <span className={`dp-chevron ${isExpanded ? 'open' : ''}`}>▼</span>
                  )}
                </div>

                {/* ── Simple-preset active info ── */}
                {!preset.hasSubcategories && isSimpleActive && (
                  <div className="dp-simple-info" onClick={e => e.stopPropagation()}>
                    <div style={{ marginBottom: 4 }}>
                      <span className="dp-info-pill" style={{ background: preset.color }}>Cause</span>
                      <p className="dp-info-text">{preset.cause}</p>
                    </div>
                    <div>
                      <span className="dp-info-pill" style={{ background: preset.color }}>Effect</span>
                      <p className="dp-info-text">{preset.effect}</p>
                    </div>
                  </div>
                )}

                {/* ── Sub-category drawer ── */}
                {preset.hasSubcategories && (
                  <div
                    className={`dp-sub-list ${isExpanded ? 'open' : ''}`}
                    onClick={e => e.stopPropagation()}
                  >
                    {preset.subcategories.map(sub => {
                      const isSubActive = active === sub.label

                      return (
                        <div key={sub.label}>
                          <button
                            className={`dp-sub-btn ${isSubActive ? 'active' : ''}`}
                            style={{ '--ac': sub.color }}
                            onClick={() => handleSubClick(sub)}
                          >
                            {/* dot | SHORT acronym | full name ellipsis | pulse dot if active */}
                            <div className="dp-sub-header">
                              <div className="dp-sub-dot" style={{ background: sub.color }} />
                              <span className="dp-sub-short" style={{ color: sub.color }}>
                                {sub.short}
                              </span>
                              <span className="dp-sub-name">
                                {sub.label.replace(/^[A-Z]+\s*—\s*/, '')}
                              </span>
                              {isSubActive && (
                                <div className="dp-sub-active-dot" style={{ background: sub.color }} />
                              )}
                            </div>

                            {/* Tags — always visible so user can scan at a glance */}
                            <div className="dp-tags">
                              {sub.tags.map(tag => (
                                <span
                                  key={tag}
                                  className="dp-tag"
                                  style={{ borderColor: sub.color + '55', color: sub.color }}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </button>

                          {/* Info drawer — only for active sub */}
                          {isSubActive && (
                            <div className="dp-info">
                              <div className="dp-info-section">
                                <span className="dp-info-pill" style={{ background: sub.color }}>
                                  ⚠ Cause
                                </span>
                                <p className="dp-info-text">{sub.cause}</p>
                              </div>
                              <div className="dp-info-section">
                                <span className="dp-info-pill" style={{ background: sub.color }}>
                                  ↯ Effect
                                </span>
                                <p className="dp-info-text">{sub.effect}</p>
                              </div>
                              <div className="dp-metrics">
                                {[
                                  ['EF',       sub.metrics.ef,         false],
                                  ['HR',        sub.metrics.hr,         false],
                                  ['GLS',       sub.metrics.gls,        false],
                                  ['ECG',       sub.metrics.ecgPattern, true ],
                                  ['PV Loop',   sub.metrics.pvPattern,  true ],
                                ].map(([k, v, span]) => (
                                  <div
                                    key={k}
                                    className={`dp-metric ${span ? 'span2' : ''}`}
                                  >
                                    <span className="dp-metric-key">{k}</span>
                                    <span className="dp-metric-val" style={{ color: sub.color }}>{v}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}