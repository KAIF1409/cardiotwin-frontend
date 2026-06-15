import { useState, useEffect } from 'react'

const ACHIEVEMENTS = [
  {
    id: 'first_slider',
    label: '🎚️ First Steps',
    desc: 'Moved a slider for the first time',
  },
  {
    id: 'heart_failure',
    label: '❤️‍🩹 Heart Failure',
    desc: 'Simulated heart failure state',
  },
  {
    id: 'athlete',
    label: '⚡ Athlete Mode',
    desc: 'Achieved athlete heart state',
  },
  {
    id: 'mi',
    label: '🔴 MI Survivor',
    desc: 'Simulated myocardial infarction',
  },
  {
    id: 'chamber_explorer',
    label: '🔬 Chamber Explorer',
    desc: 'Explored all 4 chambers',
  },
  {
    id: 'slice_master',
    label: '✂️ Slice Master',
    desc: 'Used the slice feature',
  },
  {
    id: 'strain_viewer',
    label: '🧬 Strain Viewer',
    desc: 'Viewed strain heatmap',
  },
  {
    id: 'guided_complete',
    label: '📚 Tour Complete',
    desc: 'Completed guided learning tour',
  },
]

export default function ProgressTracker({ unlocked = [], onClose }) {
  const pct = Math.round((unlocked.length / ACHIEVEMENTS.length) * 100)

  return (
    <div
      style={{
        position: 'fixed',
        top: '60px',
        right: '300px',
        background: '#1a1a2e',
        border: '2px solid #ab47bc',
        borderRadius: '12px',
        padding: '16px',
        width: '260px',
        zIndex: 1000,
        boxShadow: '0 0 24px #ab47bc44',
        animation: 'slideInRight 0.3s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
        }}
      >
        <h3
          style={{
            color: '#ab47bc',
            margin: 0,
            fontSize: '13px',
          }}
        >
          🏆 Progress
        </h3>

        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          background: '#0f0f1a',
          borderRadius: '4px',
          height: '6px',
          marginBottom: '4px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: '#ab47bc',
            height: '6px',
            borderRadius: '4px',
            width: `${pct}%`,
            transition: 'width 0.5s ease',
          }}
        />
      </div>

      {/* Progress Text */}
      <p
        style={{
          color: '#666',
          fontSize: '10px',
          marginBottom: '12px',
        }}
      >
        {unlocked.length} / {ACHIEVEMENTS.length} — {pct}%
      </p>

      {/* Achievement List */}
      {ACHIEVEMENTS.map((a) => {
        const isUnlocked = unlocked.includes(a.id)

        return (
          <div
            key={a.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
              opacity: isUnlocked ? 1 : 0.35,
              transition: 'opacity 0.2s ease',
            }}
          >
            <span style={{ fontSize: '16px' }}>
              {isUnlocked ? '✅' : '⬜'}
            </span>

            <div>
              <div
                style={{
                  color: isUnlocked ? '#ccc' : '#555',
                  fontSize: '11px',
                  fontWeight: 'bold',
                }}
              >
                {a.label}
              </div>

              <div
                style={{
                  color: '#666',
                  fontSize: '10px',
                  lineHeight: '1.4',
                }}
              >
                {a.desc}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}