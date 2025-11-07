import ResultChip from "./ResultChip";

// Função auxiliar para converter tipo de aposta em texto amigável
function getBetTypeLabel(type) {
  const labels = {
    straight_up: "Pleno (número único)",
    split: "Cavalo (2 números)",
    street: "Transversal (3 números)",
    corner: "Quadra (4 números)",
    line: "Linha (6 números)",
    column: "Coluna (12 números)",
    dozen: "Dúzia (12 números)",
    red: "Vermelho (18 números)",
    black: "Preto (18 números)",
    even: "Par (18 números)",
    odd: "Ímpar (18 números)",
    low: "Baixo 1-18",
    high: "Alto 19-36",
    numbers: "Números específicos",
    sector: "Setor da roda",
    clusters: "Clusters de vizinhos",
  };
  return labels[type] || type;
}

export default function RoulettePatternsPanel({
  signal,
  nextSignalIn = null,
  noSignalMessage = null,
  lastNumber = null, // Último número que saiu
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
          Sinais de Roleta
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
            style={{
              textAlign: "center",
              padding: "20px 0",
              color: "#c0c0c0",
            }}>
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
        return {
          ...baseStyle,
          borderColor: "#00ff00",
        };
      case "MEDIUM_SIGNAL":
        return {
          ...baseStyle,
          borderColor: "#ffff00",
        };
      default:
        return {
          ...baseStyle,
          borderColor: "#ffa500",
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

  return (
    <div style={box}>
      <h3 style={{ marginTop: 0, marginBottom: 16, color: "#ecf0f1" }}>
        Sinais de Roleta
      </h3>

      <div style={getSignalStyles()}>
        {/* Header */}
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
          {/* Badge: detecção pausada enquanto valida o sinal ativo */}
          <span
            style={{
              marginLeft: 8,
              fontSize: 11,
              color: "#c0c0c0",
              backgroundColor: "#2a2a2a",
              padding: "2px 8px",
              borderRadius: 10,
              border: "1px solid #3a3a3a",
            }}
            title="Novos padrões suspensos até validar ACERTO/ERRO">
            ⏸️ Detecção pausada
          </span>
        </div>

        <h4 style={{ margin: "0 0 12px 0", fontSize: 16, color: "#ecf0f1" }}>
          {signal.description}
        </h4>

        {/* Referência ao jogador - Aposte após número X */}
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
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#ffd700",
              }}>
              🎯 Aposte após o número:
            </span>
            {(() => {
              const redNumbers = [
                1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34,
                36,
              ];
              const color =
                lastNumber === 0
                  ? "green"
                  : redNumbers.includes(lastNumber)
                  ? "red"
                  : "black";
              return <ResultChip number={lastNumber} color={color} />;
            })()}
            <span
              style={{
                fontSize: 13,
                color: "#c0c0c0",
                fontStyle: "italic",
              }}>
              (faça sua aposta agora!)
            </span>
          </div>
        )}

        {/* Bet Type Label com detalhes específicos */}
        {signal.suggestedBet.type &&
          signal.suggestedBet.type !== "straight_up" && (
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
                📍 Tipo: {getBetTypeLabel(signal.suggestedBet.type)}
                {/* Mostrar qual coluna específica */}
                {signal.suggestedBet.type === "column" && signal.targets && signal.targets.length > 0 && (() => {
                  const firstNum = signal.targets[0];
                  const column = firstNum % 3 === 0 ? 3 : firstNum % 3;
                  const columnNames = { 1: "1ª Coluna (1-34)", 2: "2ª Coluna (2-35)", 3: "3ª Coluna (3-36)" };
                  return ` → ${columnNames[column] || `Coluna ${column}`}`;
                })()}
                {/* Mostrar qual dúzia específica */}
                {signal.suggestedBet.type === "dozen" && signal.targets && signal.targets.length > 0 && (() => {
                  const firstNum = signal.targets[0];
                  const dozen = firstNum <= 12 ? 1 : firstNum <= 24 ? 2 : 3;
                  const dozenNames = { 1: "1ª Dúzia (1-12)", 2: "2ª Dúzia (13-24)", 3: "3ª Dúzia (25-36)" };
                  return ` → ${dozenNames[dozen] || `Dúzia ${dozen}`}`;
                })()}
              </span>
            </div>
          )}

        {/* Targets */}
        <div>
          <strong style={{ fontSize: 14, color: "#ecf0f1" }}>
            Apostar em:
          </strong>
          <div style={targetGridStyle}>
            {signal.targets.slice(0, 20).map((num) => {
              // Determinar cor do número
              const redNumbers = [
                1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34,
                36,
              ];
              const color =
                num === 0
                  ? "green"
                  : redNumbers.includes(num)
                  ? "red"
                  : "black";
              return <ResultChip key={num} number={num} color={color} />;
            })}
            {signal.targets.length > 20 && (
              <span
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#2a2a2a",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#c0c0c0",
                  border: "1px solid #3a3a3a",
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
              color: "#c0c0c0",
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
