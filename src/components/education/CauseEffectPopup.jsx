import { useEffect, useState } from 'react'

const EXPLANATIONS = {
  Preload: (val, prev) => ({
    color: val > 70 ? '#ff9800' : val < 30 ? '#ef5350' : '#00e676',
    title: val > 70 ? '⬆️ High Preload' : val < 30 ? '⬇️ Low Preload' : '✅ Normal Preload',
    cause: val > 70
      ? 'Increased venous return — more blood filling the ventricle'
      : val < 30
      ? 'Reduced venous return — dehydration or blood loss'
      : 'Normal ventricular filling',
    effect: val > 70
      ? 'Frank-Starling: stronger contraction, higher HR, increased CO'
      : val < 30
      ? 'Weaker contraction, lower CO, compensatory HR rise'
      : 'Optimal stroke volume and cardiac output',
    clinical: val > 70
      ? 'Seen in: fluid overload, heart failure, renal failure'
      : val < 30
      ? 'Seen in: dehydration, haemorrhage, diuretic overuse'
      : 'Normal resting physiology',
    treatment: val > 70
      ? '💊 Diuretics (furosemide) to reduce fluid load'
      : val < 30
      ? '💉 IV fluids, blood transfusion if haemorrhage'
      : '✅ No intervention needed'
  }),

  Afterload: (val) => ({
    color: val > 70 ? '#ef5350' : val < 30 ? '#00e676' : '#00e676',
    title: val > 70 ? '⬆️ High Afterload' : val < 30 ? '⬇️ Low Afterload' : '✅ Normal Afterload',
    cause: val > 70
      ? 'High vascular resistance — heart pumps against increased pressure'
      : val < 30
      ? 'Low vascular resistance — vasodilation or septic shock'
      : 'Normal systemic vascular resistance',
    effect: val > 70
      ? 'EF drops, wall stress increases, ventricle hypertrophies over time'
      : val < 30
      ? 'EF improves, CO increases, heart works less'
      : 'Normal ejection fraction and wall stress',
    clinical: val > 70
      ? 'Seen in: hypertension, aortic stenosis, vasoconstriction'
      : val < 30
      ? 'Seen in: septic shock, vasodilator drugs, athlete at rest'
      : 'Normal resting physiology',
    treatment: val > 70
      ? '💊 ACE inhibitors, ARBs, amlodipine to reduce resistance'
      : val < 30
      ? '💉 Vasopressors (noradrenaline) if in shock'
      : '✅ No intervention needed'
  }),

  Contractility: (val) => ({
    color: val > 70 ? '#00bcd4' : val < 30 ? '#ef5350' : '#00e676',
    title: val > 70 ? '⬆️ High Contractility' : val < 30 ? '⬇️ Low Contractility' : '✅ Normal Contractility',
    cause: val > 70
      ? 'Increased myocardial force — exercise, adrenaline, inotropes'
      : val < 30
      ? 'Weak myocardium — heart failure, cardiomyopathy, infarction'
      : 'Normal myocardial contractile function',
    effect: val > 70
      ? 'EF rises, stronger pulse, higher CO, increased O2 demand'
      : val < 30
      ? 'EF drops below 40%, weak pulse, low CO, fluid congestion'
      : 'EF 55-70%, normal pulse, adequate CO',
    clinical: val > 70
      ? 'Seen in: exercise, adrenaline surge, dobutamine infusion'
      : val < 30
      ? 'Seen in: dilated cardiomyopathy, post-MI, severe heart failure'
      : 'Normal resting cardiac function',
    treatment: val > 70
      ? '🫀 Usually beneficial — monitor O2 demand'
      : val < 30
      ? '💊 Digoxin, dobutamine, cardiac resynchronisation therapy'
      : '✅ No intervention needed'
  }),

  'Infarct %': (val) => ({
    color: val > 30 ? '#ef5350' : val > 10 ? '#ff9800' : '#00e676',
    title: val > 30 ? '🔴 Significant Infarction' : val > 10 ? '⚠️ Mild Infarction' : '✅ No Infarction',
    cause: val > 0
      ? 'Myocardial necrosis — blocked coronary artery cuts off blood supply'
      : 'No myocardial damage',
    effect: val > 30
      ? 'Severe EF drop, ECG changes, LV strain worsens, heart failure risk'
      : val > 10
      ? 'Mild EF reduction, increased HR, early strain changes'
      : 'Normal cardiac function',
    clinical: val > 0
      ? 'STEMI or NSTEMI — emergency coronary revascularisation needed'
      : 'Healthy myocardium',
    treatment: val > 0
      ? '🚨 Primary PCI (stenting), thrombolysis, aspirin, beta-blockers'
      : '✅ No intervention needed'
  }),

  'Valve Area': (val) => ({
    color: val < 50 ? '#ef5350' : val < 75 ? '#ff9800' : '#00e676',
    title: val < 50 ? '🔴 Severe Stenosis' : val < 75 ? '⚠️ Moderate Stenosis' : '✅ Normal Valve',
    cause: val < 100
      ? 'Valve leaflet thickening/calcification — reduced opening area'
      : 'Normal valve leaflet mobility and opening',
    effect: val < 50
      ? 'Severe obstruction, high pressure gradient, low CO, syncope risk'
      : val < 75
      ? 'Moderate obstruction, exertional symptoms, pressure rise'
      : 'Normal flow, normal pressure gradient',
    clinical: val < 75
      ? 'Seen in: calcific aortic stenosis, rheumatic heart disease'
      : 'Normal valve function',
    treatment: val < 50
      ? '🏥 TAVI or surgical valve replacement'
      : val < 75
      ? '💊 Monitor, diuretics for symptoms, plan for intervention'
      : '✅ No intervention needed'
  })
}

export default function CauseEffectPopup({ trigger }) {
  const [visible, setVisible] = useState(false)
  const [content, setContent] = useState(null)

  useEffect(() => {
    if (!trigger) return
    const exp = EXPLANATIONS[trigger.label]?.(trigger.value)
    if (!exp) return
    setContent({ ...exp, label: trigger.label, value: trigger.value })
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 7000)
    return () => clearTimeout(timer)
  }, [trigger])

  if (!visible || !content) return null

  return (
    <div style={{
      position: 'fixed', bottom: '24px', left: '50%',
      transform: 'translateX(-50%)',
      background: '#1a1a2e',
      border: `2px solid ${content.color}`,
      borderRadius: '12px', padding: '16px 20px',
      width: '520px', zIndex: 1000,
      boxShadow: `0 0 24px ${content.color}44`,
      animation: 'fadeIn 0.3s ease'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ color: content.color, margin: 0, fontSize: '14px' }}>{content.title}</h3>
        <button onClick={() => setVisible(false)}
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px' }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {[
          { label: '🔍 Cause', text: content.cause },
          { label: '⚡ Effect', text: content.effect },
          { label: '🏥 Clinical', text: content.clinical },
          { label: '💊 Treatment', text: content.treatment },
        ].map(({ label, text }) => (
          <div key={label} style={{ background: '#0f0f1a', borderRadius: '6px', padding: '8px' }}>
            <div style={{ color: content.color, fontSize: '10px', fontWeight: 'bold', marginBottom: '4px' }}>{label}</div>
            <div style={{ color: '#ccc', fontSize: '11px', lineHeight: '1.5' }}>{text}</div>
          </div>
        ))}
      </div>
    </div>
  )
}