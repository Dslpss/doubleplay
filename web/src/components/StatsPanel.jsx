export default function StatsPanel({ stats, streaks }) {
  const box = { border: '1px solid #eee', borderRadius: 8, padding: 12 };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Distribuição</h3>
        <p>Vermelho: {stats.red} | Preto: {stats.black} | Branco: {stats.white}</p>
        <p>Total: {stats.total} | Par: {stats.even} | Ímpar: {stats.odd}</p>
      </div>
      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Sequência atual</h3>
        <p>{streaks.current.color || '-'}: {streaks.current.length}</p>
      </div>
      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Maior sequência</h3>
        <p>Vermelho: {streaks.max.red} | Preto: {streaks.max.black} | Branco: {streaks.max.white}</p>
      </div>
    </div>
  );
}