import { useMemo, useState } from "react";

export default function BankrollCalculator({ doubleHistory = [] }) {
  // Campos essenciais apenas
  const [initialBankrollStr, setInitialBankrollStr] = useState("1000");
  const [baseBetStr, setBaseBetStr] = useState("10");
  const [systemMode, setSystemMode] = useState("no_gale"); // 'gale' | 'no_gale' | 'first_spin_only'
  const [martingaleMultiplierStr, setMartingaleMultiplierStr] = useState("2");
  const [maxAttemptsStr, setMaxAttemptsStr] = useState("3");

  // Taxa de acerto observada (geral) no histórico
  const overallHitPercent = useMemo(() => {
    if (!Array.isArray(doubleHistory) || doubleHistory.length === 0)
      return null;
    const hits = doubleHistory.filter((s) => !!s.hit).length;
    return (hits / doubleHistory.length) * 100;
  }, [doubleHistory]);

  // Taxa de acerto @1 (primeiro giro)
  const firstSpinHitPercent = useMemo(() => {
    if (!Array.isArray(doubleHistory) || doubleHistory.length === 0)
      return null;
    const total = doubleHistory.length;
    const hits1 = doubleHistory.filter((s) => s.hitOnAttempt === 1).length;
    return (hits1 / total) * 100;
  }, [doubleHistory]);

  const hitProbFirst = useMemo(() => {
    if (firstSpinHitPercent != null) return firstSpinHitPercent / 100;
    return 0.45; // fallback conservador
  }, [firstSpinHitPercent]);

  // Cálculos condicionais por sistema
  const result = useMemo(() => {
    const b = parseFloat(baseBetStr) || 0;
    const initial = parseFloat(initialBankrollStr) || 0;
    const horizon = Math.max(10, Math.min(20, doubleHistory.length || 10));

    if (systemMode === "gale") {
      // EV com Martingale simples (payout 1:1, prob por giro = pFirst)
      const p = hitProbFirst;
      const m = Math.max(1, parseFloat(martingaleMultiplierStr) || 2);
      const n = Math.max(1, Math.floor(parseInt(maxAttemptsStr) || 1));

      const bets = Array.from({ length: n }, (_, i) => b * Math.pow(m, i));
      const sumBets = bets.reduce((s, x) => s + x, 0);

      const profits = bets.map((betK, kIdx) => {
        const k = kIdx + 1;
        const prob = Math.pow(1 - p, k - 1) * p; // (1-p)^(k-1) * p
        const costUntilK = bets.slice(0, k).reduce((s, x) => s + x, 0);
        const profitK = 1 * betK - costUntilK;
        return { prob, profitK, betK };
      });
      const pNoHit = Math.pow(1 - p, n);
      const expectedProfitPerSignal =
        profits.reduce((acc, cur) => acc + cur.prob * cur.profitK, 0) +
        pNoHit * -sumBets;
      const avgWagerPerSignal = bets.reduce(
        (acc, betK, idx) => acc + betK * Math.pow(1 - p, idx),
        0
      );
      const totalExpected = initial + expectedProfitPerSignal * horizon;
      return {
        mode: "gale",
        profitPerSignal: expectedProfitPerSignal,
        totalExpected,
        avgWagerPerSignal,
        horizon,
        pNoHit,
      };
    }

    // Sem gale / Primeiro giro: 1 tentativa, payout 1:1
    const p = systemMode === "first_spin_only" ? hitProbFirst : hitProbFirst;
    const profitPerSignal = p * b - (1 - p) * b;
    const avgWagerPerSignal = b;
    const totalExpected = initial + profitPerSignal * horizon;
    return {
      mode: systemMode,
      profitPerSignal,
      totalExpected,
      avgWagerPerSignal,
      horizon,
      pNoHit: 1 - p,
    };
  }, [
    systemMode,
    hitProbFirst,
    baseBetStr,
    initialBankrollStr,
    martingaleMultiplierStr,
    maxAttemptsStr,
    doubleHistory.length,
  ]);

  // Sugestão de risco: percentual da banca para aposta base
  const suggestedPct = useMemo(() => {
    const pct = overallHitPercent == null
      ? 0.01
      : overallHitPercent < 45
      ? 0.01
      : overallHitPercent < 55
      ? 0.015
      : 0.02;
    return pct; // 1%–2%
  }, [overallHitPercent]);

  const suggestedBet = useMemo(() => {
    const banca = parseFloat(initialBankrollStr) || 0;
    return banca * suggestedPct;
  }, [initialBankrollStr, suggestedPct]);

  const fmt = (v) =>
    Number(v).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div
      style={{
        border: "1px solid #3a3a3a",
        borderRadius: 12,
        backgroundColor: "#1f1f1f",
        color: "#ecf0f1",
        overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
      }}>
      {/* Top bar/acento sutil dentro do padrão */}
      <div
        style={{
          height: 6,
          background:
            "linear-gradient(90deg, rgba(155,89,182,0.5) 0%, rgba(52,152,219,0.5) 100%)",
        }}
      />
      <div style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}>
          <h3 style={{ margin: 0 }}>Calculadora de Banca</h3>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "#c0c0c0",
            }}>
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 10,
                backgroundColor: "#2a2a2a",
                border: "1px solid #3a3a3a",
              }}
              title="Taxa de acerto observada no histórico">
              {overallHitPercent != null
                ? `Acerto: ${overallHitPercent.toFixed(1)}%`
                : "Sem histórico"}
            </span>
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 10,
                backgroundColor: "#2a2a2a",
                border: "1px solid #3a3a3a",
              }}
              title="Acerto no primeiro giro (@1)">
              {firstSpinHitPercent != null
                ? `@1: ${firstSpinHitPercent.toFixed(1)}%`
                : "@1: —"}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ marginTop: 12, borderTop: "1px solid #2a2a2a" }} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 12,
          }}>
        {/* Modo de sistema */}
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>Sistema</span>
          <select
            value={systemMode}
            onChange={(e) => setSystemMode(e.target.value)}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #3a3a3a",
              backgroundColor: "#2a2a2a",
              color: "#ecf0f1",
            }}>
            <option value="no_gale">Sem Gale</option>
            <option value="gale">Gale</option>
            <option value="first_spin_only">Apenas 1º giro</option>
          </select>
          <small style={{ color: "#c0c0c0" }}>
            Sem Gale = 1 tentativa por sinal. Gale = recuperação com múltiplas tentativas.
          </small>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>Banca inicial</span>
          <input
            type="number"
            value={initialBankrollStr}
            onChange={(e) => setInitialBankrollStr(e.target.value)}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #3a3a3a",
              backgroundColor: "#2a2a2a",
              color: "#ecf0f1",
            }}
          />
          <small style={{ color: "#c0c0c0" }}>
            Seu saldo disponível para apostas. Usado como ponto de partida na
            projeção.
          </small>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>Valor da aposta (base)</span>
          <input
            type="number"
            value={baseBetStr}
            onChange={(e) => setBaseBetStr(e.target.value)}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #3a3a3a",
              backgroundColor: "#2a2a2a",
              color: "#ecf0f1",
            }}
          />
          <small style={{ color: "#c0c0c0" }}>
            Valor da aposta por sinal (flat). Payout considerado: 1:1.
          </small>
        </label>
        {systemMode === "gale" && (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>Multiplicador (Gale)</span>
              <input
                type="number"
                value={martingaleMultiplierStr}
                onChange={(e) => setMartingaleMultiplierStr(e.target.value)}
                step="0.1"
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #3a3a3a",
                  backgroundColor: "#2a2a2a",
                  color: "#ecf0f1",
                }}
              />
              <small style={{ color: "#c0c0c0" }}>
                Fator de aumento após perda (ex.: 2 = dobra).
              </small>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>Máx. tentativas</span>
              <input
                type="number"
                value={maxAttemptsStr}
                onChange={(e) => setMaxAttemptsStr(e.target.value)}
                min={1}
                max={10}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #3a3a3a",
                  backgroundColor: "#2a2a2a",
                  color: "#ecf0f1",
                }}
              />
              <small style={{ color: "#c0c0c0" }}>
                Número máximo de tentativas por sinal (inclui o 1º giro).
              </small>
            </label>
          </>
        )}
        </div>

      <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>Taxa de acerto (histórico):</strong>
          <div>
            {overallHitPercent != null
              ? `${overallHitPercent.toFixed(1)}%`
              : "Sem histórico suficiente"}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>Probabilidade usada:</strong>
          <div>
            {(
              (systemMode === "gale" ? hitProbFirst : hitProbFirst) * 100
            ).toFixed(2)}%
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>Lucro esperado por sinal:</strong>
          <div>R$ {fmt(result.profitPerSignal)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>Valor médio apostado por sinal:</strong>
          <div>R$ {fmt(result.avgWagerPerSignal)}</div>
        </div>
        {systemMode === "gale" && (
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong>
              Probabilidade de NÃO acertar em {parseInt(maxAttemptsStr) || 0} tentativas:
            </strong>
            <div>{(result.pNoHit * 100).toFixed(2)}%</div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <strong>Projeção após {result.horizon} sinais:</strong>
        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>
          R$ {fmt(result.totalExpected)}
        </div>
        <div style={{ marginTop: 8, color: "#c0c0c0", fontSize: 13 }}>
          Estes valores são expectativas matemáticas baseadas no histórico
          recente. Não são garantias e não consideram limites de mesa nem
          impostos.
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid #3a3a3a",
        }}>
        <strong>Sugestão de aposta base:</strong>
        <div
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #9b59b6",
            backgroundColor: "rgba(155, 89, 182, 0.08)",
            color: "#caa0e6",
            fontSize: 13,
          }}>
          {overallHitPercent != null ? (
            <span>
              Com acerto histórico de {overallHitPercent.toFixed(1)}%, uma
              aposta base de ~{(suggestedPct * 100).toFixed(1)}% da banca
              (R$ {fmt(suggestedBet)}) tende a equilibrar risco e retorno.
            </span>
          ) : (
            <span>
              Sem histórico, use entre 1% e 2% da banca por sinal como
              referência (R$ {fmt(suggestedBet)}).
            </span>
          )}
        </div>
      </div>
      </div>

      {/* Estilos locais para inputs focados, dentro do padrão escuro */}
      <style>{`
        input[type="number"]:focus {
          outline: none;
          border-color: #9b59b6 !important;
          box-shadow: 0 0 0 2px rgba(155, 89, 182, 0.25);
        }
      `}</style>
    </div>
  );
}
