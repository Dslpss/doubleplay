import { useMemo, useState } from "react";

export default function BankrollCalculator({
  rouletteHistory = [],
  doubleHistory = [],
}) {
  // armazenar como string para permitir campo vazio ao editar
  const [initialBankrollStr, setInitialBankrollStr] = useState("1000");
  const [baseBetStr, setBaseBetStr] = useState("10");
  const [strategy, setStrategy] = useState("flat");
  const [payoutStr, setPayoutStr] = useState("1"); // 1 = even money
  const [martingaleMultiplierStr, setMartingaleMultiplierStr] = useState("2");
  const [maxAttemptsStr, setMaxAttemptsStr] = useState("3");
  const [signalsCountStr, setSignalsCountStr] = useState("10");
  const [useHistory, setUseHistory] = useState("none"); // 'none' | 'roulette' | 'double'
  const [manualHitPercentStr, setManualHitPercentStr] = useState("40");

  // Compute historical precision@1 if available
  const roulettePrecision1 = useMemo(() => {
    if (!Array.isArray(rouletteHistory) || rouletteHistory.length === 0)
      return null;
    const total = rouletteHistory.length;
    const hits1 = rouletteHistory.filter((s) => s.hitOnAttempt === 1).length;
    return (hits1 / total) * 100;
  }, [rouletteHistory]);

  const doublePrecision1 = useMemo(() => {
    if (!Array.isArray(doubleHistory) || doubleHistory.length === 0)
      return null;
    const total = doubleHistory.length;
    const hits1 = doubleHistory.filter((s) => s.hitOnAttempt === 1).length;
    return (hits1 / total) * 100;
  }, [doubleHistory]);

  const hitProb = useMemo(() => {
    if (useHistory === "roulette" && roulettePrecision1 != null)
      return roulettePrecision1 / 100;
    if (useHistory === "double" && doublePrecision1 != null)
      return doublePrecision1 / 100;
    const m = parseFloat(manualHitPercentStr);
    return Math.max(0, Math.min(1, (isNaN(m) ? 0 : m) / 100));
  }, [useHistory, roulettePrecision1, doublePrecision1, manualHitPercentStr]);

  // Compute expected values
  const result = useMemo(() => {
    const p = hitProb;
    const b = parseFloat(baseBetStr) || 0;
    const pay = parseFloat(payoutStr) || 1;
    if (strategy === "flat") {
      // Expected profit per signal
      const profitPerSignal = p * (pay * b) - (1 - p) * b;
      const initial = parseFloat(initialBankrollStr) || 0;
      const signalsCount = parseInt(signalsCountStr) || 0;
      const totalExpected = initial + profitPerSignal * signalsCount;
      const avgWagerPerSignal = b; // flat
      return {
        profitPerSignal,
        totalExpected,
        avgWagerPerSignal,
        pNoHit: 1 - p,
      };
    }

    // Martingale / recovery strategy
    const m = Math.max(1, parseFloat(martingaleMultiplierStr) || 2);
    const n = Math.max(1, Math.floor(parseInt(maxAttemptsStr) || 1));
    // Bets sequence
    const bets = Array.from({ length: n }, (_, i) => b * Math.pow(m, i));
    const sumBets = bets.reduce((s, x) => s + x, 0);

    // Probability of hit on attempt k (1-based): (1-p)^(k-1) * p
    const profits = bets.map((betK, kIdx) => {
      const k = kIdx + 1;
      const prob = Math.pow(1 - p, k - 1) * p;
      const profitK = pay * betK - bets.slice(0, k).reduce((s, x) => s + x, 0);
      return { prob, profitK, betK };
    });

    const pNoHit = Math.pow(1 - p, n);
    const expectedProfitPerSignal =
      profits.reduce((acc, cur) => acc + cur.prob * cur.profitK, 0) +
      pNoHit * -sumBets;

    // Average amount wagered per signal (expected total wager considering how many attempts are played)
    // P(attempt k is played) = P(reach attempt k) = (1-p)^(k-1)
    const avgWagerPerSignal = bets.reduce(
      (acc, betK, idx) => acc + betK * Math.pow(1 - p, idx),
      0
    );

    const initial = parseFloat(initialBankrollStr) || 0;
    const signalsCount = parseInt(signalsCountStr) || 0;
    const totalExpected = initial + expectedProfitPerSignal * signalsCount;
    return {
      profitPerSignal: expectedProfitPerSignal,
      totalExpected,
      avgWagerPerSignal,
      pNoHit,
    };
  }, [
    hitProb,
    baseBetStr,
    payoutStr,
    strategy,
    martingaleMultiplierStr,
    maxAttemptsStr,
    initialBankrollStr,
    signalsCountStr,
  ]);

  const fmt = (v) =>
    Number(v).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div
      style={{
        border: "1px solid #3a3a3a",
        padding: 16,
        borderRadius: 12,
        backgroundColor: "#1f1f1f",
        color: "#ecf0f1",
      }}>
      <h3 style={{ marginTop: 0 }}>Calculadora de Banca</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 12,
        }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>Banca inicial</span>
          <input
            type="number"
            value={initialBankrollStr}
            onChange={(e) => setInitialBankrollStr(e.target.value)}
            style={{ padding: 8 }}
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
            style={{ padding: 8 }}
          />
          <small style={{ color: "#c0c0c0" }}>
            Valor da aposta inicial por sinal. No Martingale, este é o valor da
            1ª tentativa.
          </small>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>Estratégia</span>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            style={{ padding: 8 }}>
            <option value="flat">Flat (mesma aposta)</option>
            <option value="martingale">Martingale / Recuperação</option>
          </select>
          <small style={{ color: "#c0c0c0" }}>
            Flat: mesma aposta em cada tentativa. Martingale: aumenta a aposta
            após perda para tentar recuperar o prejuízo.
          </small>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>Pagamento (multiplicador)</span>
          <input
            type="number"
            value={payoutStr}
            onChange={(e) => setPayoutStr(e.target.value)}
            step="0.1"
            style={{ padding: 8 }}
          />
          <small style={{ color: "#c0c0c0" }}>
            Multiplicador do pagamento para a aposta (ex.: 1 = ganha o valor
            apostado; 2 = duplica o retorno).
          </small>
        </label>

        {strategy === "martingale" && (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>Multiplicador Martingale</span>
              <input
                type="number"
                value={martingaleMultiplierStr}
                onChange={(e) => setMartingaleMultiplierStr(e.target.value)}
                step="0.1"
                style={{ padding: 8 }}
              />
              <small style={{ color: "#c0c0c0" }}>
                Fator usado para aumentar a aposta após uma perda (ex.: 2 =
                dobra).
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
                style={{ padding: 8 }}
              />
              <small style={{ color: "#c0c0c0" }}>
                Número máximo de tentativas por sinal (inclui o 1º giro).
              </small>
            </label>
          </>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>Usar histórico para taxa de acerto 1º giro</span>
          <select
            value={useHistory}
            onChange={(e) => setUseHistory(e.target.value)}
            style={{ padding: 8 }}>
            <option value="none">Manual (digitar % abaixo)</option>
            <option value="roulette">Roleta (histórico)</option>
            <option value="double">Double (histórico)</option>
          </select>
          <small style={{ color: "#c0c0c0" }}>
            Selecione um histórico para usar a taxa observada no cálculo
            (substitui o valor manual).
          </small>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>Taxa de acerto no 1º giro (%)</span>
          <input
            type="number"
            value={manualHitPercentStr}
            onChange={(e) => setManualHitPercentStr(e.target.value)}
            min={0}
            max={100}
            style={{ padding: 8 }}
          />
          <small style={{ color: "#c0c0c0" }}>
            Estimativa da probabilidade de acerto no primeiro giro. Útil quando
            não há histórico disponível.
          </small>
          <small style={{ color: "#c0c0c0", display: "block", marginTop: 4 }}>
            {roulettePrecision1 != null &&
              `Roleta histórico @1: ${fmt(roulettePrecision1)}%`}{" "}
            {doublePrecision1 != null &&
              ` • Double histórico @1: ${fmt(doublePrecision1)}%`}
          </small>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>Nº de sinais (projeção)</span>
          <input
            type="number"
            value={signalsCountStr}
            onChange={(e) => setSignalsCountStr(e.target.value)}
            min={1}
            style={{ padding: 8 }}
          />
          <small style={{ color: "#c0c0c0" }}>
            Quantidade de sinais que serão considerados na projeção (horizonte
            da simulação).
          </small>
        </label>
      </div>

      <div
        style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>Probabilidade usada:</strong>
          <div>{(hitProb * 100).toFixed(2)}%</div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>Lucro esperado por sinal:</strong>
          <div>R$ {fmt(result.profitPerSignal)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>Valor médio apostado por sinal:</strong>
          <div>R$ {fmt(result.avgWagerPerSignal)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>
            Probabilidade de NÃO acertar em {parseInt(maxAttemptsStr) || 0}{" "}
            tentativas:
          </strong>
          <div>{(result.pNoHit * 100).toFixed(2)}%</div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <strong>Projeção após {parseInt(signalsCountStr) || 0} sinais:</strong>
        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>
          R$ {fmt(result.totalExpected)}
        </div>
        <div style={{ marginTop: 8, color: "#c0c0c0", fontSize: 13 }}>
          Estes valores são expectativas matemáticas, não garantias. Não
          consideram limites de mesa, variação de payout por tipo de aposta nem
          impostos.
        </div>
      </div>
    </div>
  );
}
