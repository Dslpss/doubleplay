export default function LastOutcomeCard({ history = [], title = "Últimos Resultados" }) {
  const containerStyle = {
    border: "1px solid #3a3a3a",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#1f1f1f",
  };

  const rowStyle = (ok) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: ok ? "rgba(46, 204, 113, 0.08)" : "rgba(231, 76, 60, 0.08)",
    border: `1px solid ${ok ? "#2ecc71" : "#e74c3c"}`,
    color: "#ecf0f1",
    fontSize: 13,
  });

  const lastHit = Array.isArray(history)
    ? history.find((h) => h && h.hit === true)
    : null;
  const lastMiss = Array.isArray(history)
    ? history.find((h) => h && h.hit === false)
    : null;

  return (
    <div style={containerStyle}>
      <h2 style={{ marginTop: 0, marginBottom: 12, color: "#ecf0f1", fontSize: 20 }}>{title}</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {/* Último Acerto */}
        <div style={rowStyle(true)}>
          <span style={{ fontSize: 18 }}>✅</span>
          <span style={{ fontWeight: 600 }}>Último Acerto</span>
          <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>
            {lastHit ? new Date(lastHit.timestamp).toLocaleTimeString() : "—"}
          </span>
          <div style={{ width: "100%" }} />
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {lastHit ? lastHit.description || "Sinal" : "Nenhum acerto ainda"}
          </span>
        </div>

        {/* Último Loss */}
        <div style={rowStyle(false)}>
          <span style={{ fontSize: 18 }}>❌</span>
          <span style={{ fontWeight: 600 }}>Último Loss</span>
          <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>
            {lastMiss ? new Date(lastMiss.timestamp).toLocaleTimeString() : "—"}
          </span>
          <div style={{ width: "100%" }} />
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {lastMiss ? lastMiss.description || "Sinal" : "Nenhum loss ainda"}
          </span>
        </div>
      </div>
    </div>
  );
}