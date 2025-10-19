export default function EventsCard({ events = [], max = 50, onClear }) {
  const card = {
    border: '1px solid #eee',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    textAlign: 'left',
  };
  const header = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };
  const count = { fontSize: 12, color: '#666' };
  const listBox = {
    border: '1px solid #f0f0f0',
    borderRadius: 8,
    height: 320,
    overflowY: 'auto',
    padding: 8,
    background: '#fafafa',
    textAlign: 'left',
  };
  const item = {
    border: '1px solid #eee',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    background: '#fff',
    color: '#213547',
  };
  const pre = {
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: 12,
    lineHeight: 1.35,
    color: '#213547',
  };

  return (
    <div style={card}>
      <div style={header}>
        <h3 style={{ margin: 0 }}>Eventos recentes</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={count}>mostrando {events.length} de {max}</span>
          <button onClick={onClear}>Limpar</button>
        </div>
      </div>
      <div style={listBox}>
        {events.length === 0 ? (
          <p style={{ color: '#666', fontSize: 12 }}>Nenhum evento ainda.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {events.map((e, i) => (
              <li key={i} style={item}>
                <pre style={pre}>{JSON.stringify(e, null, 2)}</pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}