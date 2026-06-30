/**
 * ErrorBanner.jsx
 * Displays a list of parse or validation errors.
 */

export default function ErrorBanner({ errors }) {
  if (!errors || errors.length === 0) return null
  return (
    <div
      style={{
        background: '#fce8e8',
        border: '1px solid #e57373',
        borderLeft: '3px solid #c0392b',
        borderRadius: 4,
        padding: '0.6rem 0.9rem',
        marginTop: '0.5rem',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12, color: '#8a1a1a', marginBottom: 4 }}>
        {errors.length} issue{errors.length > 1 ? 's' : ''} found
      </div>
      {errors.map((e, i) => (
        <div key={i} style={{ fontSize: 12, color: '#5a1010', marginTop: 2 }}>
          {e}
        </div>
      ))}
    </div>
  )
}
