import ResultChip from "./ResultChip";
import { labelPtForColor } from "../services/double.js";

export default function DoublePatternsPanel({
  signal,
  nextSignalIn = null,
  noSignalMessage = null,
  lastNumber = null,
}) {
  const box = {
    border: "1px solid #3a3a3a",
    borderRadius: 8,
    padding: 16,
    backgroundColor: "#1f1f1f",
  };

  if (!signal) {
    return (
      <div style={box}>
        <h3 style={{ marginTop: 0, marginBottom: 16, color: "#ecf0f1" }}>
          Sinais do Double
        </h3>
        {noSignalMessage ? (
          <div
            style={{
              textAlign: "center",
              padding: "20px 0",
              color: "#e74c3c",
              backgroundColor: "#2a2a2a",
              borderRadius: 8,
              border: "1px solid #e74c3c",
            }}>
            <p style={{ fontSize: 16, marginBottom: 0 }}>{noSignalMessage}</p>
          </div>
        ) : (
          <div
            style={{ textAlign: "center", padding: "20px 0", color: "#c0c0c0" }}>
            <p style={{ fontSize: 16, marginBottom: 8 }}>🔍 Analisando padrões...</p>
            {nextSignalIn !== null && (
              <p style={{ fontSize: 14, color: "#999" }}>
                Próximo sinal em {nextSignalIn} resultado{nextSignalIn !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const getSignalStyles = () => {
    const baseStyle = {
      border: "2px solid",
      borderRadius: 12,
      padding: 16,
      animation: "pulse 2s infinite",
      backgroundColor: "#1f1f1f",
    };
    switch (signal.type) {
      case "STRONG_SIGNAL":
        return { ...baseStyle, borderColor: "#00ff00" };
      case "MEDIUM_SIGNAL":
        return { ...baseStyle, borderColor: "#ffff00" };
      default:
        return { ...baseStyle, borderColor: "#ffa500" };
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

  const statsStyle = {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#c0c0c0",
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid #3a3a3a",
  };

  const progressBarStyle = {
    width: "100%",
    height: 6,
    backgroundColor: "#2a2a2a",
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 8,
  };

  const progressFillStyle = {
    height: "100%",
    backgroundColor: signal.color,
    transition: "width 0.3s ease",
  };

  const betLabel = `Aposte: ${labelPtForColor(signal.suggestedBet.color)}`;

  return (
    <div style={box}>
      <h3 style={{ marginTop: 0, marginBottom: 16, color: "#ecf0f1" }}>Sinais do Double</h3>

      <div style={getSignalStyles()}>
        <div style={{ marginBottom: 12 }}>
          <span style={confidenceBadgeStyle}>{signal.confidence}/10</span>
          {signal.isLearning && (
            <span
              style={{
                fontSize: 11,
                color: "#c0c0c0",
                backgroundColor: "#2a2a2a",
                padding: "2px 8px",
                borderRadius: 10,
                border: "1px solid #3a3a3a",
              }}>
              🧪 Aprendendo
            </span>
          )}
        </div>

        <h4 style={{ margin: "0 0 12px 0", fontSize: 16, color: "#ecf0f1" }}>{signal.description}</h4>

        {lastNumber !== null && (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              backgroundColor: "#2a2a2a",
              borderRadius: 8,
              border: "2px solid #ffd700",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#ffd700" }}>🎯 Aposte após o número:</span>
            {(() => {
              const color = lastNumber === 0 ? "white" : lastNumber <= 7 ? "red" : "black";
              return <ResultChip number={lastNumber} color={color} />;
            })()}
            <span style={{ fontSize: 13, color: "#c0c0c0" }}>(faça sua aposta agora!)</span>
          </div>
        )}

        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              display: "inline-block",
              padding: "4px 12px",
              backgroundColor: "#2a2a2a",
              borderRadius: 16,
              fontSize: 12,
              color: "#ffd700",
              border: "1px solid #3a3a3a",
              fontWeight: "500",
            }}>
            📍 {betLabel}
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                marginLeft: 8,
                borderRadius: 3,
                border: "1px solid #3a3a3a",
                verticalAlign: "middle",
                backgroundColor:
                  signal.suggestedBet?.color === "red"
                    ? "#e74c3c"
                    : signal.suggestedBet?.color === "black"
                    ? "#000"
                    : "#ecf0f1",
              }}
              title={`Cor: ${labelPtForColor(signal.suggestedBet.color)}`}
            />
          </span>
        </div>

        {/* Targets removidos do card de sinais do Double conforme solicitado */}

        {/* Motivos do sinal (sinal composto) */}
        {Array.isArray(signal.reasons) && signal.reasons.length >= 2 && (
          <div
            style={{
              marginBottom: 8,
              padding: 10,
              backgroundColor: "#2a2a2a",
              borderRadius: 8,
              border: "1px solid #3a3a3a",
              color: "#c0c0c0",
              fontSize: 12,
            }}
          >
            <span style={{ color: "#ffd700", fontWeight: 600 }}>Baseado em:</span> {signal.reasons.join("; ")}
          </div>
        )}

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
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#c0c0c0", marginBottom: 4 }}>
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