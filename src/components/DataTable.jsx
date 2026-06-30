/**
 * DataTable.jsx
 *
 * Renders a simple table from an array of objects.
 * Columns are defined as [{ key, label, render? }].
 */

export default function DataTable({ columns, rows, emptyMessage = 'No data loaded.' }) {
  if (!rows || rows.length === 0) {
    return (
      <div
        style={{
          padding: '1rem',
          textAlign: 'center',
          color: '#888',
          fontSize: 13,
          border: '1px solid #CECECE',
          borderRadius: 4,
        }}
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #CECECE', borderRadius: 4 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#131A48', color: '#fff' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '7px 10px',
                  textAlign: 'left',
                  fontWeight: 700,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}
            >
              {columns.map((col) => (
                <td key={col.key} style={{ padding: '6px 10px', color: '#131A48', verticalAlign: 'top' }}>
                  {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
