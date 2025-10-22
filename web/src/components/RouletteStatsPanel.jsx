export default function RouletteStatsPanel({ stats, streaks }) {
  const box = { border: '1px solid #eee', borderRadius: 8, padding: 12 };
  const labelColor = (c) => (c === 'red' ? '#e74c3c' : c === 'black' ? '#2c3e50' : '#10b981');
  const colorPt = (c) => (c === 'red' ? 'Vermelho' : c === 'black' ? 'Preto' : 'Verde');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, justifyContent: 'center', justifyItems: 'center' }}>
      <div style={{ ...box, width: '100%', maxWidth: 380 }}>
        <h3 style={{ marginTop: 0 }}>Distribuição (Roleta)</h3>
        <p>
          <span style={{ color: labelColor('red'), fontWeight: 600 }}>Vermelho</span>: {stats.red} |
          <span style={{ color: labelColor('black'), fontWeight: 600 }}> Preto</span>: {stats.black} |
          <span style={{ color: labelColor('green'), fontWeight: 600 }}> Verde (0)</span>: {stats.green}
        </p>
        <p>Total: {stats.total} | Par: {stats.even} | Ímpar: {stats.odd}</p>
      </div>
      <div style={{ ...box, width: '100%', maxWidth: 380 }}>
        <h3 style={{ marginTop: 0 }}>Sequência atual</h3>
        <p>
          {streaks.current.color ? (
            <span style={{ color: labelColor(streaks.current.color), fontWeight: 600 }}>
              {colorPt(streaks.current.color)}
            </span>
          ) : (
            '-' 
          )}: {streaks.current.length}
        </p>
      </div>
      <div style={{ ...box, width: '100%', maxWidth: 380 }}>
        <h3 style={{ marginTop: 0 }}>Maior sequência</h3>
        <p>
          <span style={{ color: labelColor('red'), fontWeight: 600 }}>Vermelho</span>: {streaks.max.red} |
          <span style={{ color: labelColor('black'), fontWeight: 600 }}> Preto</span>: {streaks.max.black} |
          <span style={{ color: labelColor('green'), fontWeight: 600 }}> Verde</span>: {streaks.max.green}
        </p>
      </div>
    </div>
  );
}