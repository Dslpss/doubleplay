export default function SpinHitStatsCard({ history = [], title = "Estatísticas por Giro" }) {
  const safeHistory = Array.isArray(history) ? history : [];

  const hitsOn1 = safeHistory.filter((h) => h && h.hit && h.hitOnAttempt === 1).length;
  const hitsOn2 = safeHistory.filter((h) => h && h.hit && h.hitOnAttempt === 2).length;
  const hitsOn3 = safeHistory.filter((h) => h && h.hit && h.hitOnAttempt === 3).length;

  const attemptsStats = [
    { attempt: 1, hits: hitsOn1, color: "#3498db" },
    { attempt: 2, hits: hitsOn2, color: "#9b59b6" },
    { attempt: 3, hits: hitsOn3, color: "#e67e22" },
  ];

  const maxHits = Math.max(hitsOn1, hitsOn2, hitsOn3);
  const leadingAttempts = attemptsStats.filter((s) => s.hits === maxHits && maxHits > 0).map((s) => s.attempt);

  let leaderLabel = "Nenhum acerto ainda";
  if (leadingAttempts.length === 1) {
    leaderLabel = `Mais acertos no Giro ${leadingAttempts[0]}`;
  } else if (leadingAttempts.length > 1) {
    leaderLabel = `Empate entre Giro ${leadingAttempts.join(" e ")}`;
  }

  return (
    <div
      style={{
        border: "1px solid #333",
        borderRadius: 8,
        padding: 12,
        background: "#1e1e1e",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span
          style={{
            fontSize: 12,
            color: "#bbb",
          }}
        >
          Base: {safeHistory.filter((h) => h && typeof h.hit === "boolean").length} sinais
        </span>
      </div>

      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
        {attemptsStats.map((s) => {
          const isLeader = s.hits === maxHits && maxHits > 0;
          return (
            <div
              key={s.attempt}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: 8,
                borderRadius: 6,
                border: `1px solid ${isLeader ? s.color : "#444"}`,
                background: isLeader ? `${s.color}22` : "#252525",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  background: s.color,
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                <strong>Giro {s.attempt}</strong>
                <span>{s.hits} acertos</span>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 10,
          padding: 8,
          borderRadius: 6,
          background: "#2c2c2c",
          border: "1px solid #444",
          fontSize: 13,
        }}
      >
        {leaderLabel}
      </div>
    </div>
  );
}