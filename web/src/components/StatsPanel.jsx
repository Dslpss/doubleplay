export default function StatsPanel({ stats, streaks }) {
  const box = { border: '1px solid #eee', borderRadius: 8, padding: 12 };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Distribuição</h3>
        <p>Red: {stats.red} | Black: {stats.black} | White: {stats.white}</p>
        <p>Total: {stats.total} | Par: {stats.even} | Ímpar: {stats.odd}</p>
      </div>
      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Streak atual</h3>
        <p>{streaks.current.color || '-'}: {streaks.current.length}</p>
      </div>
      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Streak máxima</h3>
        <p>Red: {streaks.max.red} | Black: {streaks.max.black} | White: {streaks.max.white}</p>
      </div>
    </div>
  );
}