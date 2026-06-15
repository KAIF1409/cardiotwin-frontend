import { useEffect, useRef, useState } from 'react'

const explanations = {
  Preload: (val) => {
    if (val > 70) return {
      title: '⬆️ High Preload',
      color: '#ff9800',
      body: 'The heart is filling with MORE blood before each beat (increased venous return). This stretches the ventricle walls, causing a stronger contraction — known as the Frank-Starling mechanism. Heart rate increases to handle the extra volume.',
      effect: '📈 HR increases • Stroke Volume increases • Heart works harder'
    }

    if (val < 30) return {
      title: '⬇️ Low Preload',
      color: '#ef5350',
      body: 'The heart is filling with LESS blood — like in dehydration or blood loss. Less stretch means weaker contraction and reduced cardiac output. HR may rise to compensate.',
      effect: '📉 HR decreases • Stroke Volume drops • Risk of low CO'
    }

    return {
      title: '✅ Normal Preload',
      color: '#00e676',
      body: 'Ventricular filling is within normal range. The heart is receiving an optimal volume of blood before each contraction.',
      effect: '✅ Normal HR • Normal Stroke Volume • Efficient pumping'
    }
  },

  Afterload: (val) => {
    if (val > 70) return {
      title: '⬆️ High Afterload',
      color: '#ef5350',
      body: 'The heart is pumping AGAINST high resistance — like in hypertension or valve stenosis. The ventricle must generate more pressure to eject blood, which reduces ejection fraction over time and can cause heart failure.',
      effect: '📉 EF drops • Ventricle wall thickens • Heart failure risk'
    }

    if (val < 30) return {
      title: '⬇️ Low Afterload',
      color: '#00e676',
      body: 'The heart is pumping against LOW resistance — like in vasodilation or athlete conditions. Blood flows more easily, improving cardiac output with less effort.',
      effect: '📈 EF improves • Less cardiac workload • Seen in athletes'
    }

    return {
      title: '✅ Normal Afterload',
      color: '#00e676',
      body: 'Vascular resistance is within normal range. The heart can eject blood efficiently without excessive pressure generation.',
      effect: '✅ Normal EF • Normal wall stress • Efficient ejection'
    }
  },

  Contractility: (val) => {
    if (val > 70) return {
      title: '⬆️ High Contractility',
      color: '#00bcd4',
      body: 'The heart muscle is contracting with GREATER force — like during exercise or with inotropic drugs (e.g. adrenaline). More blood is ejected per beat, increasing ejection fraction significantly.',
      effect: '📈 EF increases • Stronger pulse • Higher Cardiac Output'
    }

    if (val < 30) return {
      title: '⬇️ Low Contractility',
      color: '#ef5350',
      body: 'The heart muscle is WEAK — as seen in heart failure, cardiomyopathy, or after a heart attack. Less blood is ejected per beat despite normal filling, causing a dangerously low EF.',
      effect: '📉 EF drops below 40% • Weak pulse • Heart failure signs'
    }

    return {
      title: '✅ Normal Contractility',
      color: '#00e676',
      body: 'The heart muscle is contracting normally. Ejection fraction is within the healthy range of 55–70%.',
      effect: '✅ EF 55–70% • Normal pulse strength • Healthy function'
    }
  }
}

export default function ExplanationPopup({ trigger }) {
  const [visible, setVisible] = useState(false)
  const [content, setContent] = useState(null)

  const timerRef = useRef(null)

  useEffect(() => {
    if (!trigger) return

    const exp = explanations[trigger.label]?.(trigger.value)

    if (!exp) return

    setContent(exp)
    setVisible(true)

    // prevent stacking timers
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      setVisible(false)
    }, 5000)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [trigger])

  if (!visible || !content) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '30px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1a1a2e',
        border: `2px solid ${content.color}`,
        borderRadius: '12px',
        padding: '16px 20px',
        width: '480px',
        zIndex: 1000,
        boxShadow: `0 0 20px ${content.color}44`,
        animation: 'fadeIn 0.3s ease'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <h3
          style={{
            color: content.color,
            margin: 0,
            fontSize: '14px'
          }}
        >
          {content.title}
        </h3>

        <button
          onClick={() => setVisible(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          ✕
        </button>
      </div>

      <p
        style={{
          color: '#ddd',
          fontSize: '12px',
          margin: '8px 0',
          lineHeight: '1.6'
        }}
      >
        {content.body}
      </p>

      <div
        style={{
          background: '#0f0f1a',
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '11px',
          color: content.color
        }}
      >
        {content.effect}
      </div>
    </div>
  )
}