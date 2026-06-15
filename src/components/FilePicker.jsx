import { useRef, useEffect } from 'react'

export default function FilePicker({
  onFileLoaded,
  currentModel,
}) {
  const currentUrlRef = useRef(null)

  useEffect(() => {
    return () => {
      // Cleanup blob URL on unmount
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current)
      }
    }
  }, [])

  const handleFile = (e) => {
    const file = e.target.files?.[0]

    if (!file) return

    // Validate extension
    const isGLB =
      file.name.toLowerCase().endsWith('.glb') ||
      file.type === 'model/gltf-binary'

    if (!isGLB) {
      alert('Please select a valid .glb file')
      return
    }

    try {
      // Cleanup previous blob URL
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current)
      }

      // IMPORTANT:
      // DO NOT wrap inside new Blob([...])
      // This breaks some GLB models
      const url = URL.createObjectURL(file)

      currentUrlRef.current = url

      onFileLoaded(url, file.name)
    } catch (err) {
      console.error('Failed to load GLB:', err)
      alert('Failed to load model')
    }

    // Reset input so same file can be selected again
    e.target.value = ''
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <h3
        style={{
          color: '#00bcd4',
          fontSize: '11px',
          margin: 0,
          letterSpacing: '2px',
          textTransform: 'uppercase',
        }}
      >
        🫀 Heart Model
      </h3>

      {/* Current model */}
      <div
        style={{
          background: '#0f0f1a',
          borderRadius: '6px',
          padding: '6px 8px',
          border: '1px solid #2a2a3e',
          fontSize: '10px',
        }}
      >
        <span style={{ color: '#555' }}>Loaded: </span>

        <span style={{ color: '#00e676' }}>
          {currentModel || 'Default (heart.glb)'}
        </span>
      </div>

      {/* Upload button */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          background: 'linear-gradient(135deg, #00bcd4, #0097a7)',
          border: 'none',
          color: 'white',
          borderRadius: '6px',
          padding: '8px',
          fontSize: '11px',
          cursor: 'pointer',
          fontWeight: 'bold',
          textAlign: 'center',
          transition: '0.2s',
        }}
      >
        📂 Browse GLB File

        <input
          type="file"
          accept=".glb,model/gltf-binary"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
      </label>

      <p
        style={{
          color: '#444',
          fontSize: '9px',
          textAlign: 'center',
          margin: 0,
        }}
      >
        Only .glb files accepted
      </p>
    </div>
  )
}