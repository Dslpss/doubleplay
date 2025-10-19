export default function UserBetPanel({ bets }) {
  const box = { border: '1px solid #eee', borderRadius: 8, padding: 12 };
  const label = { fontSize: 12, color: '#666' };
  const Stat = ({ title, value, pct, color }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ minWidth: 80 }}>{title}</span>
      <div style={{ flex: 1, background: '#f5f5f5', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: color, height: 8 }} />
      </div>
      <span style={{ minWidth: 64, textAlign: 'right' }}>{value} ({pct}%)</span>
    </div>
  );

  const colors = {
    red: '#e74c3c',
    black: '#2c3e50',
    white: '#f39c12',
  };

  return (
    <div style={box}>
      <h3 style={{ marginTop: 0 }}>Apostas dos usuários (eventos recentes)</h3>
      {bets?.total ? (
        <>
          <p style={label}>Total de apostas detectadas: {bets.total}</p>
          <p style={label}>Eventos analisados: {bets.sampled}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            <Stat title="Vermelho" value={bets.red} pct={bets.pct?.red || 0} color={colors.red} />
            <Stat title="Preto" value={bets.black} pct={bets.pct?.black || 0} color={colors.black} />
            <Stat title="Branco" value={bets.white} pct={bets.pct?.white || 0} color={colors.white} />
          </div>
        </>
      ) : (
        <p>Nenhuma aposta de usuários detectada nos eventos recentes.</p>
      )}
    </div>
  );
}