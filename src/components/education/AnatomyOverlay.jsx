import { getRegionLabels } from '../../data/regionMapper'

const LABELS = getRegionLabels()

export default function AnatomyOverlay({ onSelect, selected, ef }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>

      {/* EF Badge */}
      <div style={{
        position: 'absolute', top: '8px', left: '50%',
        transform: 'translateX(-50%)',
        background: ef >= 55 ? '#1b5e20' : ef >= 40 ? '#e65100' : '#b71c1c',
        color: 'white', padding: '4px 14px',
        borderRadius: '20px', fontSize: '12px', fontWeight: 'bold'
      }}>
        EF: {ef}% {ef >= 55 ? '✅' : ef >= 40 ? '⚠️' : '🔴'}
        <span style={{ color: '#aaa', fontSize: '10px', marginLeft: '6px' }}>
          (MRI baseline)
        </span>
      </div>

      {/* Region Labels from region_map.json */}
      {LABELS.map(label => (
        <div key={label.id} style={{
          position: 'absolute', top: label.top, left: label.left,
          pointerEvents: 'auto', cursor: 'pointer'
        }} onClick={() => onSelect(label.id === selected ? null : label.id)}>
          <div style={{
            width: '11px', height: '11px', borderRadius: '50%',
            background: label.color,
            border: selected === label.id ? '3px solid white' : '2px solid white',
            boxShadow: `0 0 ${selected === label.id ? '12px' : '6px'} ${label.color}`
          }} />
          <div style={{
            position: 'absolute', top: '-6px', left: '15px',
            background: selected === label.id ? label.color : 'rgba(0,0,0,0.75)',
            color: selected === label.id ? 'white' : label.color,
            fontSize: '10px', fontWeight: 'bold',
            padding: '2px 6px', borderRadius: '4px',
            border: `1px solid ${label.color}`, whiteSpace: 'nowrap'
          }}>
            {label.id}
          </div>
        </div>
      ))}

      <div style={{
        position: 'absolute', bottom: '10px', left: '50%',
        transform: 'translateX(-50%)',
        color: '#555', fontSize: '10px'
      }}>
        Labels from Intern 1 region map • Click to learn • Drag to rotate
      </div>
    </div>
  )
}