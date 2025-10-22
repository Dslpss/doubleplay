export default function RoulettePatternsPanel({ patterns }) {
  const box = { border: '1px solid #eee', borderRadius: 8, padding: 12 };
  return (
    <div style={box}>
      <h3 style={{ marginTop: 0 }}>Padrões Detectados (Roleta)</h3>
      {(!patterns || patterns.length === 0) ? (
        <p>Nenhum padrão relevante no histórico recente.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {patterns.map((p, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: 'bold' }}>{p.description}</span>
              <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>(risco: {p.risk})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}