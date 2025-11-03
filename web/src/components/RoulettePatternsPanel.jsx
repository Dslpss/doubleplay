import ResultChip from "./ResultChip";

export default function RoulettePatternsPanel({ signal, nextSignalIn = null }) {
  const box = {
    border: "1px solid #eee",
    borderRadius: 8,
    padding: 16,
    backgroundColor: "#fafafa",
  };

  if (!signal) {
    return (
      <div style={box}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Sinais de Roleta</h3>
        <div style={{ textAlign: "center", padding: "20px 0", color: "#666" }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>
            🔍 Analisando padrões...
          </p>
          {nextSignalIn !== null && (
            <p style={{ fontSize: 14, color: "#999" }}>
              Próximo sinal em {nextSignalIn} resultado
              {nextSignalIn !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    );
  }

  const getSignalStyles = () => {
    const baseStyle = {
      border: "2px solid",
      borderRadius: 12,
      padding: 16,
      animation: "pulse 2s infinite",
    };

    switch (signal.type) {
      case "STRONG_SIGNAL":
        return {
          ...baseStyle,
          borderColor: "#00ff00",
          backgroundColor: "#f0fff0",
        };
      case "MEDIUM_SIGNAL":
        return {
          ...baseStyle,
          borderColor: "#ffff00",
          backgroundColor: "#fffef0",
        };
      default:
        return {
          ...baseStyle,
          borderColor: "#ffa500",
          backgroundColor: "#fff5e6",
        };
    }
  };

  const confidenceBadgeStyle = {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: 20,
    backgroundColor: signal.color,
    color: signal.confidence >= 7.5 ? "#000" : "#fff",
    fontWeight: "bold",
    fontSize: 14,
    marginRight: 8,
  };

  const targetGridStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  };

  const statsStyle = {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#666",
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid #ddd",
  };

  const progressBarStyle = {
    width: "100%",
    height: 6,
    backgroundColor: "#e0e0e0",
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 8,
  };

  const progressFillStyle = {
    height: "100%",
    backgroundColor: signal.color,
    transition: "width 0.3s ease",
  };

  return (
    <div style={box}>
      <h3 style={{ marginTop: 0, marginBottom: 16 }}>Sinais de Roleta</h3>

      <div style={getSignalStyles()}>
        {/* Header */}
        <div style={{ marginBottom: 12 }}>
          <span style={confidenceBadgeStyle}>{signal.confidence}/10</span>
          {signal.isLearning && (
            <span
              style={{
                fontSize: 11,
                color: "#999",
                backgroundColor: "#fff",
                padding: "2px 8px",
                borderRadius: 10,
                border: "1px solid #ddd",
              }}>
              🧪 Aprendendo
            </span>
          )}
        </div>

        <h4 style={{ margin: "0 0 12px 0", fontSize: 16 }}>
          {signal.description}
        </h4>

        {/* Targets */}
        <div>
          <strong style={{ fontSize: 14, color: "#333" }}>Apostar em:</strong>
          <div style={targetGridStyle}>
            {signal.targets.slice(0, 20).map((num) => (
              <ResultChip key={num} value={num} size="large" highlight />
            ))}
            {signal.targets.length > 20 && (
              <span
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#f0f0f0",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#666",
                }}>
                +{signal.targets.length - 20} números
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div style={statsStyle}>
          <span>📊 Cobertura: {signal.suggestedBet.coverage}</span>
          <span>💰 ROI: {signal.suggestedBet.expectedRoi}</span>
          {signal.historicalAccuracy !== null && (
            <span>✅ Acurácia: {signal.historicalAccuracy}%</span>
          )}
        </div>

        {/* Progress bar - giros restantes */}
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: "#666",
              marginBottom: 4,
            }}>
            <span>Válido por:</span>
            <span>{signal.validFor} giros</span>
          </div>
          <div style={progressBarStyle}>
            <div style={{ ...progressFillStyle, width: "100%" }} />
          </div>
        </div>
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
