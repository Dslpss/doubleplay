import { useEffect, useRef, useState } from "react";
import "./App.css";
import { status, connectWsBridge } from "./services/api";
import { createWsClient } from "./services/wsClient";
import {
  parseDoublePayload,
  summarizeResults,
  computeStreaks,
  detectSimplePatterns,
  summarizeRoulette,
  computeRouletteStreaks,
} from "./services/parser";
import ResultChip from "./components/ResultChip";
import StatsPanel from "./components/StatsPanel";
import PatternsPanel from "./components/PatternsPanel";
import RouletteStatsPanel from "./components/RouletteStatsPanel";
import RoulettePatternsPanel from "./components/RoulettePatternsPanel";
import {
  detectBestRouletteSignal,
  validateSignalOutcome,
  ADAPTIVE_RESET_STRATEGIES,
} from "./services/roulette";
import DoubleEmbedPanel from "./components/DoubleEmbedPanel";
import RouletteEmbedPanel from "./components/RouletteEmbedPanel";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || null;

function App() {
  const [serverStatus, setServerStatus] = useState({});
  const [results, setResults] = useState([]);
  const [roulette, setRoulette] = useState([]);
  const wsRef = useRef(null);
  const lastRouletteKeyRef = useRef(null);
  const MAX_RESULTS = 100;

  const [autoBetEnabled, setAutoBetEnabled] = useState(false);
  const [lastAutoBetRound, setLastAutoBetRound] = useState(null);
  const [lastAutoBetStatus, setLastAutoBetStatus] = useState(null);
  const [lastPatternKey, setLastPatternKey] = useState(null);
  const [activeSignal, setActiveSignal] = useState(null);
  const [signalHistory, setSignalHistory] = useState([]);
  const [historyLimit, setHistoryLimit] = useState(5);
  const [isNarrow, setIsNarrow] = useState(false);
  const [route, setRoute] = useState(window.location.hash || "#/");
  const [autoRouletteEnabled, setAutoRouletteEnabled] = useState(true);

  // Novo sistema de sinais inteligente
  const [bestRouletteSignal, setBestRouletteSignal] = useState(null);
  const [signalValidFor, setSignalValidFor] = useState(3);
  const [resultsCountSinceSignal, setResultsCountSinceSignal] = useState(0);
  const lastValidatedResultRef = useRef(null); // Rastrear último resultado validado
  const [rouletteSignalsHistory, setRouletteSignalsHistory] = useState([]); // Histórico de sinais da roleta
  const [noSignalMessage, setNoSignalMessage] = useState(null); // Mensagem quando não há sinal
  const [currentSignalAttempts, setCurrentSignalAttempts] = useState([]); // Armazena as 3 tentativas do sinal atual (Martingale)

  const [aggressiveMode, setAggressiveMode] = useState(true);

  // Configurações de Reset Adaptativo
  const [resetStrategy, setResetStrategy] = useState(
    ADAPTIVE_RESET_STRATEGIES.FULL_RESET
  );
  const [windowSize, setWindowSize] = useState(50);
  const [changeThreshold, setChangeThreshold] = useState(0.3);
  const [maxLookback, setMaxLookback] = useState(100);
  const [recentWeight, setRecentWeight] = useState(0.7);
  const [maxRecent, setMaxRecent] = useState(15);
  const [maxHistorical, setMaxHistorical] = useState(35);

  // Janela para contagem de Finales
  /* removed unused finalesWindow and rouletteFinalCounts memo */

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 430px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const updateRoute = () => setRoute(window.location.hash || "#/");
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);

  useEffect(() => {
    wsRef.current = createWsClient((data) => {
      if (data?.type === "status") {
        setServerStatus((prev) => ({
          ...prev,
          wsConnected: Boolean(data?.connected),
        }));
      }
      if (data?.type === "double_result") {
        const parsed = parseDoublePayload(data?.data ?? data);
        if (parsed) {
          setResults((prev) => {
            const last = prev[prev.length - 1];
            const duplicateById =
              parsed.round_id &&
              prev.some((r) => r.round_id === parsed.round_id);
            const sameRound =
              last &&
              last.round_id &&
              parsed.round_id &&
              last.round_id === parsed.round_id;
            const sameRaw =
              last &&
              last.raw &&
              parsed.raw &&
              JSON.stringify(last.raw) === JSON.stringify(parsed.raw);
            const sameNumTimeClose =
              last &&
              last.number === parsed.number &&
              Math.abs((parsed.timestamp || 0) - (last.timestamp || 0)) < 2000;
            if (duplicateById || sameRound || sameRaw || sameNumTimeClose)
              return prev;
            return [...prev, parsed].slice(-MAX_RESULTS);
          });
        }
      } else if (data?.type === "roulette_result") {
        const item = data?.data ?? data;
        if (item && typeof item.number !== "undefined") {
          const normalized = {
            ...item,
            timestamp: item.timestamp || item.ts || Date.now(),
          };
          const key = `${normalized.number}-${normalized.color}`;
          if (lastRouletteKeyRef.current === key) return; // dedup persistente até mudar o número
          lastRouletteKeyRef.current = key;
          setRoulette((prev) => [normalized, ...prev].slice(0, 100));
        }
      }
    });
    (async () => {
      try {
        await connectWsBridge();
      } catch {
        /* silencioso */
      }
      // Inicia monitor da roleta apenas quando há backend externo configurado
      if (SERVER_URL) {
        try {
          await fetch(`${SERVER_URL}/api/roulette/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ intervalMs: 2000 }),
          });
        } catch {
          /* silencioso */
        }
      }
    })();

    const t = setInterval(async () => {
      const s = await status();
      setServerStatus(s);
    }, 3000);
    return () => {
      clearInterval(t);
      wsRef.current?.close();
    };
  }, []);

  const handleConnectWs = async () => {
    await connectWsBridge();
  };

  const connected = Boolean(serverStatus?.wsConnected);
  const stats = summarizeResults(results);
  const streaks = computeStreaks(results);
  const patterns = detectSimplePatterns(results);
  const rouletteStats = summarizeRoulette(roulette);
  const rouletteStreaks = computeRouletteStreaks(roulette);

  // limitar exibição a 4 pilhas (linhas), 16 resultados por linha
  const ROWS = 4;
  const PER_ROW = isNarrow ? 6 : 16;
  const last = results.slice(-(ROWS * PER_ROW));
  const lastNewestFirst = last.slice().reverse();
  const resultRows = Array.from({ length: ROWS }, (_, i) =>
    lastNewestFirst.slice(i * PER_ROW, (i + 1) * PER_ROW)
  );
  const ROW_HEIGHT = isNarrow ? 32 : 40;
  const GAP = 8;
  const resultsBoxHeight = ROW_HEIGHT * ROWS + GAP * (ROWS - 1) + 6;

  function chooseBetSignal(patterns, streaks, results) {
    if (!patterns || patterns.length === 0) return null;
    // Priorizar trinca e desequilíbrio antes do branco
    const triple = patterns.find((p) => p.key === "triple_repeat");
    if (triple && streaks?.current?.color) {
      return {
        color: streaks.current.color === "red" ? "black" : "red",
        key: "triple_repeat",
      };
    }
    const balance = patterns.find((p) => p.key === "red_black_balance");
    if (balance) {
      const stats20 = summarizeResults(results.slice(-20));
      if ((stats20.red || 0) > (stats20.black || 0))
        return { color: "red", key: "red_black_balance" };
      if ((stats20.black || 0) > (stats20.red || 0))
        return { color: "black", key: "red_black_balance" };
    }
    const white = patterns.find((p) => p.key === "white_proximity");
    if (white) return { color: "white", key: "white_proximity" };
    return null;
  }

  // Helpers de cor para UI do alerta de sinal
  const colorHex = { red: "#e74c3c", black: "#2c3e50", white: "#ecf0f1" };
  const colorLabelPt = (c) =>
    c === "red" ? "vermelho" : c === "black" ? "preto" : "branco";
  const colorSquareStyle = (c) => ({
    display: "inline-block",
    width: 16,
    height: 16,
    borderRadius: 3,
    background: colorHex[c],
    border: "1px solid rgba(0,0,0,0.2)",
    boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
  });

  /* removed unused eslint-disable directive */
  useEffect(() => {
    const lastRes = results[results.length - 1];
    if (!lastRes || !autoBetEnabled) return;
    if (lastAutoBetRound && lastRes.round_id === lastAutoBetRound) return;

    if (activeSignal) return; // não alertar se já há um sinal ativo aguardando
    const s = computeStreaks(results);
    const p = detectSimplePatterns(results);
    function computeSignalChance(signal, results) {
      const sample = results.slice(-50);
      const stats = summarizeResults(sample);
      const baseFallback = { red: 46, black: 46, white: 8 };
      const base =
        stats.total >= 10
          ? {
              red: Math.round(((stats.red || 0) / stats.total) * 100),
              black: Math.round(((stats.black || 0) / stats.total) * 100),
              white: Math.round(((stats.white || 0) / stats.total) * 100),
            }
          : baseFallback;

      const color = signal?.color || "red";
      let chance = base[color] || 0;

      const key = signal?.key;

      // Ajustes por padrão
      if (key === "white_proximity") {
        const recent10 = sample.slice(-10);
        const w10 = recent10.filter((r) => r.color === "white").length;
        chance += w10 >= 2 ? 5 : w10 === 1 ? 3 : 0;
        if (stats.total >= 20 && (stats.white || 0) === 0) chance -= 2;
      } else if (key === "triple_repeat") {
        const s = computeStreaks(results);
        chance += s.current?.length >= 3 ? 10 : 6;
      } else if (key === "red_black_balance") {
        const last20 = results.slice(-20);
        const rr = last20.filter((r) => r.color === "red").length;
        const bb = last20.filter((r) => r.color === "black").length;
        const diff = Math.abs(rr - bb);
        chance += diff >= 5 ? 8 : diff >= 3 ? 5 : 3;
      }

      // Limites
      chance = Math.max(4, Math.min(90, Math.round(chance)));
      return chance;
    }
    const signal = chooseBetSignal(p, s, results);
    if (!signal) {
      if (lastPatternKey) setLastPatternKey(null);
      return;
    }
    if (lastPatternKey === signal.key) return; // mesmo padrão ainda ativo, não repetir
    const chance = computeSignalChance(signal, results);
    // Limiar mínimo para branco para reduzir viés
    if (signal.key === "white_proximity" && chance < 12) return;
    setLastPatternKey(signal.key);
    setLastAutoBetRound(lastRes.round_id);
    setActiveSignal({
      key: signal.key,
      color: signal.color,
      fromRound: lastRes.round_id,
      number: lastRes.number,
      chance,
    });
    const colorPt =
      signal.color === "red"
        ? "vermelho"
        : signal.color === "black"
        ? "preto"
        : "branco";
    setLastAutoBetStatus(
      `Após número ${lastRes.number} aposte ${colorPt} (${chance}% de chance)`
    );
  }, [results, autoBetEnabled, lastAutoBetRound, lastPatternKey, activeSignal]);

  // Avalia o próximo resultado após um sinal e limpa o aviso
  useEffect(() => {
    if (!activeSignal) return;
    const lastRes = results[results.length - 1];
    if (!lastRes) return;
    if (lastRes.round_id === activeSignal.fromRound) return; // ainda no mesmo round do sinal
    const hit = lastRes.color === activeSignal.color;
    setLastAutoBetStatus(hit ? "Acerto" : "Erro");
    setSignalHistory((prev) =>
      [
        {
          round: lastRes.round_id,
          number: activeSignal.number ?? lastRes.number,
          color: activeSignal.color,
          key: activeSignal.key,
          result: hit ? "acerto" : "erro",
          time: Date.now(),
          chance: activeSignal.chance,
        },
        ...prev,
      ].slice(0, 50)
    );
    setActiveSignal(null);
    const t = setTimeout(() => setLastAutoBetStatus(null), 3000);
    return () => clearTimeout(t);
  }, [results, activeSignal]);

  // SISTEMA ANTIGO DE SINAIS - DESABILITADO
  // Agora usando apenas o sistema inteligente de sinais (detectBestRouletteSignal)
  /* 
  useEffect(() => {
    // ... código do sistema antigo removido ...
  }, []);
  */

  // ============================================================================
  // Sistema Inteligente de Sinais - detecta APENAS O MELHOR sinal
  // ============================================================================
  useEffect(() => {
    if (!roulette || roulette.length < 3) return;

    // ⚠️ IMPORTANTE: Só detectar novo sinal se NÃO houver um ativo
    if (bestRouletteSignal) {
      // Já existe um sinal ativo, aguardar validação
      return;
    }

    const analysisResults = [...roulette].reverse();

    console.log(
      "[Signal Detection] Analisando",
      analysisResults.length,
      "resultados da roleta"
    );
    console.log(
      "[Signal Detection] Últimos 5:",
      analysisResults.slice(-5).map((r) => r.number)
    );

    // Detectar melhor sinal
    const signal = detectBestRouletteSignal(analysisResults, {
      aggressive: aggressiveMode,
      resetOptions: {
        strategy: resetStrategy,
        windowSize,
        changeThreshold,
        maxLookback,
        recentWeight,
        maxRecent,
        maxHistorical,
      },
    });

    console.log(
      "[Signal Detection] Resultado:",
      signal ? `Sinal encontrado (${signal.patternKey})` : "Nenhum sinal forte"
    );

    if (signal) {
      console.log(
        "[Signal] Novo sinal emitido:",
        signal.patternKey,
        "Confiança:",
        signal.confidence
      );
      setBestRouletteSignal(signal);
      setSignalValidFor(signal.validFor);
      setResultsCountSinceSignal(0);
      setNoSignalMessage(null); // Limpar mensagem de "sem sinal"
    } else {
      // Nenhum padrão forte o suficiente foi detectado
      if (roulette.length % 3 === 0) {
        // Só mostrar mensagem quando completar ciclo de 3 resultados
        setNoSignalMessage("❌ Nenhum padrão forte detectado neste ciclo");
        console.log("[Signal] Nenhum padrão com confiança suficiente");

        // Limpar mensagem após 5 segundos
        setTimeout(() => {
          setNoSignalMessage(null);
        }, 5000);
      }
    }
  }, [
    roulette,
    bestRouletteSignal, // Adicionado para verificar se já existe sinal
    aggressiveMode,
    resetStrategy,
    windowSize,
    changeThreshold,
    maxLookback,
    recentWeight,
    maxRecent,
    maxHistorical,
  ]);

  // Validação de sinais - verifica se acertou ou errou
  useEffect(() => {
    if (!bestRouletteSignal || !roulette || roulette.length === 0) return;

    const latestResult = roulette[0];
    const resultNum = Number(latestResult.number);
    const resultId = `${latestResult.timestamp}-${resultNum}`;

    // Verificar se é um resultado novo (posterior ao sinal)
    if (latestResult.timestamp <= bestRouletteSignal.timestamp) return;

    // ⚠️ IMPORTANTE: Verificar se este resultado já foi validado
    if (lastValidatedResultRef.current === resultId) {
      return; // Já validamos este resultado
    }

    // Marcar como validado
    lastValidatedResultRef.current = resultId;

    // Incrementar contador de resultados desde o sinal
    const newCount = resultsCountSinceSignal + 1;
    setResultsCountSinceSignal(newCount);

    // Validar resultado
    const hit = validateSignalOutcome(bestRouletteSignal, resultNum);

    console.log(
      `[Validation] Resultado #${newCount}: ${resultNum} - ${
        hit ? "HIT ✅" : "MISS ❌"
      }`
    );
    console.log(
      `[Validation] Targets: [${bestRouletteSignal.targets
        .slice(0, 5)
        .join(", ")}...]`
    );

    // Adicionar tentativa ao array de tentativas do sinal atual (Martingale)
    const attempt = {
      attemptNumber: newCount,
      resultNumber: resultNum,
      hit,
      timestamp: Date.now(),
    };

    setCurrentSignalAttempts((prev) => [...prev, attempt]);

    // Limpar sinal IMEDIATAMENTE quando acerta OU quando expira
    if (hit) {
      console.log("[Signal] ✅ ACERTOU! Limpando sinal imediatamente.");

      // Adicionar ao histórico com TODAS as tentativas
      setRouletteSignalsHistory((prev) =>
        [
          {
            id: resultId,
            patternKey: bestRouletteSignal.patternKey,
            description: bestRouletteSignal.description,
            confidence: bestRouletteSignal.confidence,
            targets: bestRouletteSignal.targets,
            attempts: [...currentSignalAttempts, attempt], // Todas as tentativas (Martingale)
            hit: true,
            hitOnAttempt: newCount, // Em qual giro acertou
            timestamp: Date.now(),
          },
          ...prev,
        ].slice(0, 50)
      ); // Manter últimos 50

      setBestRouletteSignal(null);
      setResultsCountSinceSignal(0);
      setCurrentSignalAttempts([]); // Limpar tentativas
      lastValidatedResultRef.current = null; // Reset para próximo sinal
    } else if (newCount >= signalValidFor) {
      // Se errou e passou o prazo de validade (3 tentativas)
      console.log(
        "[Signal] ❌ Sinal expirado após",
        newCount,
        "tentativas sem acerto"
      );

      // Adicionar ao histórico com TODAS as tentativas (perdeu todas)
      setRouletteSignalsHistory((prev) =>
        [
          {
            id: resultId,
            patternKey: bestRouletteSignal.patternKey,
            description: bestRouletteSignal.description,
            confidence: bestRouletteSignal.confidence,
            targets: bestRouletteSignal.targets,
            attempts: [...currentSignalAttempts, attempt], // Todas as 3 tentativas
            hit: false,
            hitOnAttempt: null, // Não acertou em nenhum giro
            timestamp: Date.now(),
          },
          ...prev,
        ].slice(0, 50)
      ); // Manter últimos 50

      setBestRouletteSignal(null);
      setResultsCountSinceSignal(0);
      setCurrentSignalAttempts([]); // Limpar tentativas
      lastValidatedResultRef.current = null; // Reset para próximo sinal
    }
  }, [
    roulette,
    bestRouletteSignal,
    resultsCountSinceSignal,
    signalValidFor,
    currentSignalAttempts,
  ]);

  // SISTEMA ANTIGO DE VALIDAÇÃO - DESABILITADO
  // Agora usando apenas o sistema inteligente de validação
  /*
  useEffect(() => {
    // ... código do sistema antigo de validação removido ...
  }, [roulette, activeRouletteSignal]);
  */

  // SISTEMA DE MARTINGALE - DESABILITADO
  // Funcionalidade removida temporariamente
  /*
  useEffect(() => {
    // ... código do Martingale removido ...
  }, [roulette, rouletteMartingale]);
  */

  return (
    <div className="App" style={{ padding: 24 }}>
      <h1 style={{ fontSize: isNarrow ? 24 : undefined, textAlign: "center" }}>
        {route === "#/roulette" ? "Análise da Roleta" : "Análise do Double"}
      </h1>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "8px",
          marginTop: "12px",
          marginBottom: "16px",
        }}>
        <a href="#/" style={{ textDecoration: "none" }}>
          <button
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              background: route !== "#/roulette" ? "#2c3e50" : "#1f2937",
              color: "#fff",
              border: "1px solid #374151",
              fontSize: "14px",
            }}>
            Double
          </button>
        </a>
        <a href="#/roulette" style={{ textDecoration: "none" }}>
          <button
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              background: route === "#/roulette" ? "#2c3e50" : "#1f2937",
              color: "#fff",
              border: "1px solid #374151",
              fontSize: "14px",
            }}>
            Roleta
          </button>
        </a>
      </div>

      {route !== "#/roulette" && (
        <div
          className="panels"
          style={{
            display: "flex",
            gap: 16,
            marginTop: 16,
            justifyContent: "center",
          }}>
          <div
            style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8 }}>
            <h2>Conexão em tempo real</h2>
            <p>Conexão automática ao Play na Bet.</p>
            <p>
              Status: {connected ? "Conectado" : "Desconectado"}{" "}
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  marginLeft: 8,
                  background: connected ? "#2ecc71" : "#e74c3c",
                }}
              />
            </p>
            <button
              onClick={handleConnectWs}
              style={{ width: isNarrow ? "100%" : undefined }}>
              Reconectar WS
            </button>
            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 8,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: isNarrow ? "column" : "row",
                width: isNarrow ? "100%" : undefined,
              }}>
              <span style={{ opacity: 0.8 }}>Não tem conta?</span>
              <a
                href="https://playnabets.com/cadastro?refId=NjMzMTRyZWZJZA=="
                target="_blank"
                rel="noopener noreferrer"
                style={{ width: isNarrow ? "100%" : undefined }}>
                <button style={{ width: isNarrow ? "100%" : undefined }}>
                  Cadastre-se na Play na Bets
                </button>
              </a>
            </div>
          </div>

          <div
            style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8 }}>
            <h2>Auto aposta (sinal)</h2>
            <p>Estado: {autoBetEnabled ? "Ativa" : "Desativada"}</p>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}>
              <button
                onClick={() => setAutoBetEnabled((v) => !v)}
                style={{ width: isNarrow ? "100%" : undefined }}>
                {autoBetEnabled ? "Desativar sinais" : "Ativar sinais"}
              </button>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ opacity: 0.8 }}>Mostrar</span>
                <select
                  value={historyLimit}
                  onChange={(e) => setHistoryLimit(Number(e.target.value))}>
                  {[3, 5, 10, 15].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span style={{ opacity: 0.8 }}>sinais</span>
              </label>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#c0392b" }}>
              ⚠️ Você pode aplicar Martingale 2 (até duas entradas de
              recuperação), por sua conta e risco. Os sinais são apenas visuais
              e não automatizam valor nem execução de apostas.
            </div>
            {lastAutoBetStatus ? (
              <div style={{ marginTop: 8 }}>
                {activeSignal ? (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={colorSquareStyle(activeSignal.color)} />
                    <span
                      style={{
                        color: colorHex[activeSignal.color],
                        fontWeight: 600,
                      }}>
                      {colorLabelPt(activeSignal.color)}
                    </span>
                    <span style={{ opacity: 0.8, fontSize: 12 }}>
                      chance {activeSignal.chance}%
                    </span>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "#374151",
                        color: "#fff",
                        fontSize: 12,
                      }}>
                      aguardando resolução
                    </span>
                  </div>
                ) : null}
                <p
                  style={{
                    marginTop: 4,
                    opacity: 0.85,
                    color: activeSignal
                      ? activeSignal.color === "black"
                        ? "#ecf0f1"
                        : colorHex[activeSignal.color]
                      : undefined,
                  }}>
                  {lastAutoBetStatus}
                </p>
              </div>
            ) : null}

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600 }}>Histórico</div>
              {signalHistory.length === 0 ? (
                <p style={{ opacity: 0.7 }}>Nenhum sinal ainda.</p>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {signalHistory.slice(0, historyLimit).map((h, i) => (
                    <div
                      key={i}
                      style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={colorSquareStyle(h.color)} />
                      <span
                        style={{ color: colorHex[h.color], fontWeight: 600 }}>
                        {colorLabelPt(h.color)}
                      </span>
                      <span style={{ opacity: 0.8 }}>
                        após número {h.number}
                      </span>
                      <span style={{ opacity: 0.6, fontSize: 12 }}>
                        {new Date(h.time).toLocaleTimeString()}
                      </span>
                      <span
                        style={{
                          marginLeft: "auto",
                          fontWeight: 600,
                          color: h.result === "acerto" ? "#2ecc71" : "#e74c3c",
                        }}>
                        {h.result}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 24,
          display: route !== "#/roulette" ? "block" : "none",
        }}>
        <h2>Últimos Resultados</h2>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            minHeight: resultsBoxHeight,
            maxHeight: resultsBoxHeight,
            overflow: "hidden",
          }}>
          {results.length === 0 ? (
            <p>Nenhum resultado ainda.</p>
          ) : (
            resultRows.map((row, ridx) => (
              <div
                key={ridx}
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: isNarrow ? "wrap" : "nowrap",
                  overflowX: isNarrow ? "hidden" : "auto",
                  paddingBottom: 6,
                  justifyContent: "center",
                }}>
                {row.map((r, idx) => (
                  <ResultChip
                    key={`${ridx}-${idx}`}
                    number={r.number}
                    color={r.color}
                    compact={isNarrow}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 24,
          display: route !== "#/roulette" ? "block" : "none",
        }}>
        <StatsPanel stats={stats} streaks={streaks} />
      </div>

      <div
        style={{
          marginTop: 24,
          display: route !== "#/roulette" ? "block" : "none",
        }}>
        <PatternsPanel patterns={patterns} />
      </div>

      {route !== "#/roulette" && (
        <div style={{ marginTop: 24 }}>
          <DoubleEmbedPanel />
        </div>
      )}

      <div
        style={{
          marginTop: 24,
          display: route === "#/roulette" ? "block" : "none",
        }}>
        <RouletteStatsPanel stats={rouletteStats} streaks={rouletteStreaks} />
      </div>

      <div
        style={{
          marginTop: 24,
          display: route === "#/roulette" ? "block" : "none",
        }}>
        <div
          className="panels"
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            justifyContent: "center",
          }}>
          {/* Card de Auto Aposta */}
          <div
            style={{
              border: "1px solid #ccc",
              padding: 16,
              borderRadius: 8,
              flex: "1 1 400px",
              maxWidth: "600px",
            }}>
            <h2>Auto aposta (sinal) - Roleta</h2>
            <p>Estado: {autoRouletteEnabled ? "Ativa" : "Desativada"}</p>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}>
              <button
                onClick={() => setAutoRouletteEnabled((v) => !v)}
                style={{ width: isNarrow ? "100%" : undefined }}>
                {autoRouletteEnabled ? "Desativar sinais" : "Ativar sinais"}
              </button>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={aggressiveMode}
                  onChange={() => setAggressiveMode((v) => !v)}
                />
                <span style={{ opacity: 0.8 }}>Modo agressivo</span>
              </label>
            </div>

            {/* Configurações de Reset Adaptativo */}
            <div
              style={{
                marginTop: 12,
                padding: 12,
                backgroundColor: "#1f1f1f",
                borderRadius: 6,
                border: "1px solid #3a3a3a",
              }}>
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 8,
                  fontSize: 14,
                  color: "#ecf0f1",
                }}>
                🔄 Reset Adaptativo
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
                  gap: 8,
                  fontSize: 12,
                }}>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ opacity: 0.9, color: "#ecf0f1" }}>
                    Estratégia:
                  </span>
                  <select
                    value={resetStrategy}
                    onChange={(e) => setResetStrategy(e.target.value)}
                    style={{ padding: 4, fontSize: 12 }}>
                    <option value={ADAPTIVE_RESET_STRATEGIES.FULL_RESET}>
                      Reset Completo
                    </option>
                    <option value={ADAPTIVE_RESET_STRATEGIES.SLIDING_WINDOW}>
                      Janela Deslizante
                    </option>
                    <option value={ADAPTIVE_RESET_STRATEGIES.CONDITIONAL_RESET}>
                      Reset Condicional
                    </option>
                    <option value={ADAPTIVE_RESET_STRATEGIES.HYBRID}>
                      Híbrido
                    </option>
                  </select>
                </label>

                {resetStrategy === ADAPTIVE_RESET_STRATEGIES.SLIDING_WINDOW && (
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}>
                    <span style={{ opacity: 0.9, color: "#ecf0f1" }}>
                      Tamanho da Janela:
                    </span>
                    <input
                      type="number"
                      value={windowSize}
                      onChange={(e) => setWindowSize(Number(e.target.value))}
                      min="10"
                      max="200"
                      step="10"
                      style={{ padding: 4, fontSize: 12 }}
                    />
                  </label>
                )}

                {resetStrategy ===
                  ADAPTIVE_RESET_STRATEGIES.CONDITIONAL_RESET && (
                  <>
                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}>
                      <span style={{ opacity: 0.9, color: "#ecf0f1" }}>
                        Limite de Mudança:
                      </span>
                      <input
                        type="number"
                        value={changeThreshold}
                        onChange={(e) =>
                          setChangeThreshold(Number(e.target.value))
                        }
                        min="0.1"
                        max="1"
                        step="0.1"
                        style={{ padding: 4, fontSize: 12 }}
                      />
                    </label>
                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}>
                      <span style={{ opacity: 0.9, color: "#ecf0f1" }}>
                        Máx. Histórico:
                      </span>
                      <input
                        type="number"
                        value={maxLookback}
                        onChange={(e) => setMaxLookback(Number(e.target.value))}
                        min="50"
                        max="500"
                        step="50"
                        style={{ padding: 4, fontSize: 12 }}
                      />
                    </label>
                  </>
                )}

                {resetStrategy === ADAPTIVE_RESET_STRATEGIES.HYBRID && (
                  <>
                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}>
                      <span style={{ opacity: 0.9, color: "#ecf0f1" }}>
                        Peso Recente:
                      </span>
                      <input
                        type="number"
                        value={recentWeight}
                        onChange={(e) =>
                          setRecentWeight(Number(e.target.value))
                        }
                        min="0.1"
                        max="1"
                        step="0.1"
                        style={{ padding: 4, fontSize: 12 }}
                      />
                    </label>
                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}>
                      <span style={{ opacity: 0.9, color: "#ecf0f1" }}>
                        Máx. Recente:
                      </span>
                      <input
                        type="number"
                        value={maxRecent}
                        onChange={(e) => setMaxRecent(Number(e.target.value))}
                        min="5"
                        max="50"
                        step="5"
                        style={{ padding: 4, fontSize: 12 }}
                      />
                    </label>
                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}>
                      <span style={{ opacity: 0.9, color: "#ecf0f1" }}>
                        Máx. Histórico:
                      </span>
                      <input
                        type="number"
                        value={maxHistorical}
                        onChange={(e) =>
                          setMaxHistorical(Number(e.target.value))
                        }
                        min="10"
                        max="100"
                        step="10"
                        style={{ padding: 4, fontSize: 12 }}
                      />
                    </label>
                  </>
                )}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "#c0c0c0",
                  fontStyle: "italic",
                }}>
                {resetStrategy === ADAPTIVE_RESET_STRATEGIES.FULL_RESET &&
                  "Reinicia análise após cada sinal bem-sucedido"}
                {resetStrategy === ADAPTIVE_RESET_STRATEGIES.SLIDING_WINDOW &&
                  "Usa apenas os últimos N resultados"}
                {resetStrategy ===
                  ADAPTIVE_RESET_STRATEGIES.CONDITIONAL_RESET &&
                  "Reinicia quando detecta mudança significativa nos padrões"}
                {resetStrategy === ADAPTIVE_RESET_STRATEGIES.HYBRID &&
                  "Combina resultados recentes e históricos com pesos diferentes"}
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#c0392b" }}>
              ⚠️ Os sinais são visuais e sugerem números com base em padrões
              inteligentes. Use por sua conta e risco.
            </div>

            {/* Card de Sinais Inteligente */}
            <div style={{ marginTop: 16 }}>
              <RoulettePatternsPanel
                signal={bestRouletteSignal}
                nextSignalIn={
                  bestRouletteSignal ? null : 3 - (roulette.length % 3)
                }
                noSignalMessage={noSignalMessage}
                lastNumber={roulette.length > 0 ? roulette[0].number : null}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 24,
          display: route === "#/roulette" ? "block" : "none",
        }}>
        <h2>Roleta (Pragmatic) - Timeline</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {roulette.slice(0, 20).map((r, idx) => (
            <div
              key={`${r.timestamp || r.id || "r"}_${idx}`}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 14,
                background:
                  r.color === "red"
                    ? "#e11d48"
                    : r.color === "black"
                    ? "#111827"
                    : "#10b981",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
              title={`${r.number} (${r.color})`}>
              {r.number}
            </div>
          ))}
        </div>
      </div>

      {route === "#/roulette" && (
        <div style={{ marginTop: 24 }}>
          <RouletteEmbedPanel />
        </div>
      )}

      {/* Card de Histórico de Sinais - Final da Página */}
      {route === "#/roulette" && (
        <div style={{ marginTop: 24 }}>
          <div
            style={{
              border: "1px solid #3a3a3a",
              padding: 20,
              borderRadius: 12,
              backgroundColor: "#1f1f1f",
            }}>
            <h2
              style={{
                marginTop: 0,
                marginBottom: 12,
                color: "#ecf0f1",
                fontSize: 20,
              }}>
              📊 Histórico de Sinais
            </h2>
            <div
              style={{
                padding: 12,
                backgroundColor: "#2a2a2a",
                borderRadius: 8,
                marginBottom: 20,
                border: "1px solid #3498db",
              }}>
              <div
                style={{
                  fontSize: 13,
                  color: "#ecf0f1",
                  fontWeight: 600,
                  marginBottom: 8,
                }}>
                🎰 Sistema Martingale Ativo
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#c0c0c0",
                  lineHeight: 1.6,
                }}>
                Cada sinal possui{" "}
                <strong style={{ color: "#ffd700" }}>3 tentativas</strong> de
                acerto:
                <div style={{ marginTop: 6, marginLeft: 12 }}>
                  • <strong style={{ color: "#3498db" }}>Giro 1</strong>: Aposta
                  Principal
                  <br />• <strong style={{ color: "#9b59b6" }}>Giro 2</strong>:
                  Gale 1 (recuperação)
                  <br />• <strong style={{ color: "#e67e22" }}>Giro 3</strong>:
                  Gale 2 (última chance)
                </div>
              </div>
            </div>
            {rouletteSignalsHistory.length === 0 ? (
              <p
                style={{
                  opacity: 0.7,
                  textAlign: "center",
                  padding: "30px 0",
                  color: "#c0c0c0",
                  fontSize: 14,
                }}>
                Nenhum sinal validado ainda. Os sinais aparecerão aqui após
                serem testados.
              </p>
            ) : (
              <div>
                {/* Estatísticas */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 12,
                    marginBottom: 20,
                    padding: 16,
                    backgroundColor: "#2a2a2a",
                    borderRadius: 8,
                  }}>
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: "#3498db",
                      }}>
                      {rouletteSignalsHistory.length}
                    </div>
                    <div
                      style={{ fontSize: 12, color: "#c0c0c0", marginTop: 4 }}>
                      Total de sinais
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: "#2ecc71",
                      }}>
                      {rouletteSignalsHistory.filter((h) => h.hit).length}
                    </div>
                    <div
                      style={{ fontSize: 12, color: "#c0c0c0", marginTop: 4 }}>
                      ✅ Acertos
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: "#e74c3c",
                      }}>
                      {rouletteSignalsHistory.filter((h) => !h.hit).length}
                    </div>
                    <div
                      style={{ fontSize: 12, color: "#c0c0c0", marginTop: 4 }}>
                      ❌ Erros
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: "#ffd700",
                      }}>
                      {rouletteSignalsHistory.length > 0
                        ? (
                            (rouletteSignalsHistory.filter((h) => h.hit)
                              .length /
                              rouletteSignalsHistory.length) *
                            100
                          ).toFixed(1)
                        : 0}
                      %
                    </div>
                    <div
                      style={{ fontSize: 12, color: "#c0c0c0", marginTop: 4 }}>
                      Taxa de acerto
                    </div>
                  </div>
                </div>
                {/* Lista de Sinais com Scroll */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    maxHeight: "600px", // Altura máxima
                    overflowY: "auto", // Scroll vertical
                    overflowX: "hidden", // Sem scroll horizontal
                    paddingRight: 8, // Espaço para a scrollbar
                    // Estilo da scrollbar (webkit browsers)
                    scrollbarWidth: "thin", // Firefox
                    scrollbarColor: "#3498db #2a2a2a", // Firefox
                  }}
                  // Estilo da scrollbar webkit
                  className="custom-scrollbar">
                  {rouletteSignalsHistory.slice(0, 20).map((h) => (
                    <div
                      key={h.id}
                      style={{
                        padding: 16,
                        borderRadius: 10,
                        backgroundColor: "#2a2a2a",
                        border: `2px solid ${h.hit ? "#2ecc71" : "#e74c3c"}`,
                        boxShadow: h.hit
                          ? "0 0 10px rgba(46, 204, 113, 0.2)"
                          : "0 0 10px rgba(231, 76, 60, 0.2)",
                        transition: "all 0.2s ease",
                      }}>
                      {/* Header */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          marginBottom: 12,
                          flexWrap: "wrap",
                        }}>
                        <span style={{ fontSize: 24 }}>
                          {h.hit ? "✅" : "❌"}
                        </span>
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: 15,
                            color: "#ecf0f1",
                            flex: 1,
                          }}>
                          {h.description}
                        </span>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: 16,
                            backgroundColor: h.hit ? "#2ecc71" : "#e74c3c",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                          }}>
                          {h.hit ? "ACERTO" : "ERRO"}
                        </span>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: 16,
                            backgroundColor: "#3498db",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 600,
                          }}>
                          {h.confidence}/10
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            opacity: 0.6,
                            color: "#c0c0c0",
                          }}>
                          {new Date(h.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      {/* Sistema Martingale - 3 Tentativas */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          padding: 12,
                          backgroundColor: "#1f1f1f",
                          borderRadius: 8,
                        }}>
                        {/* Título Martingale */}
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#ffd700",
                            marginBottom: 8,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}>
                          <span>🎰 Sistema Martingale (3 Giros)</span>
                          {h.hit && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: "#2ecc71",
                                backgroundColor: "rgba(46, 204, 113, 0.2)",
                                padding: "2px 8px",
                                borderRadius: 12,
                              }}>
                              Acertou no Giro {h.hitOnAttempt}
                            </span>
                          )}
                        </div>

                        {/* Mostrar as 3 tentativas */}
                        {h.attempts && h.attempts.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 10,
                            }}>
                            {h.attempts.map((attempt, idx) => {
                              const redNumbers = [
                                1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25,
                                27, 30, 32, 34, 36,
                              ];
                              const resColor =
                                attempt.resultNumber === 0
                                  ? "green"
                                  : redNumbers.includes(attempt.resultNumber)
                                  ? "red"
                                  : "black";

                              // Labels para cada giro
                              const attemptLabels = [
                                "🎯 Aposta Principal",
                                "🔄 Gale 1",
                                "🔄🔄 Gale 2",
                              ];

                              return (
                                <div
                                  key={idx}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: 10,
                                    backgroundColor: attempt.hit
                                      ? "rgba(46, 204, 113, 0.15)"
                                      : "rgba(231, 76, 60, 0.1)",
                                    borderRadius: 8,
                                    border: `2px solid ${
                                      attempt.hit ? "#2ecc71" : "#e74c3c"
                                    }`,
                                  }}>
                                  <span
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: attempt.hit
                                        ? "#2ecc71"
                                        : "#e74c3c",
                                      minWidth: 140,
                                    }}>
                                    {attemptLabels[idx]}
                                  </span>
                                  <ResultChip
                                    number={attempt.resultNumber}
                                    color={resColor}
                                    compact
                                  />
                                  <span
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 700,
                                      marginLeft: "auto",
                                    }}>
                                    {attempt.hit ? "✅" : "❌"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Fallback se não houver attempts (sinais antigos) */}
                        {(!h.attempts || h.attempts.length === 0) &&
                          h.resultNumber !== undefined && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}>
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: "#ffd700",
                                  minWidth: 70,
                                }}>
                                🎯 Resultado:
                              </span>
                              {(() => {
                                const redNumbers = [
                                  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25,
                                  27, 30, 32, 34, 36,
                                ];
                                const resColor =
                                  h.resultNumber === 0
                                    ? "green"
                                    : redNumbers.includes(h.resultNumber)
                                    ? "red"
                                    : "black";
                                return (
                                  <div
                                    style={{
                                      padding: 4,
                                      backgroundColor: h.hit
                                        ? "rgba(46, 204, 113, 0.2)"
                                        : "transparent",
                                      borderRadius: 8,
                                      border: h.hit
                                        ? "2px solid #2ecc71"
                                        : "none",
                                    }}>
                                    <ResultChip
                                      number={h.resultNumber}
                                      color={resColor}
                                      compact
                                    />
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                        {/* Targets */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                          }}>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#3498db",
                              minWidth: 70,
                              paddingTop: 4,
                            }}>
                            🎲 Apostas:
                          </span>
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                              flex: 1,
                            }}>
                            {h.targets.slice(0, 10).map((num) => {
                              const redNumbers = [
                                1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25,
                                27, 30, 32, 34, 36,
                              ];
                              const color =
                                num === 0
                                  ? "green"
                                  : redNumbers.includes(num)
                                  ? "red"
                                  : "black";
                              const isHit = num === h.resultNumber;
                              return (
                                <div
                                  key={num}
                                  style={{
                                    padding: isHit ? 4 : 0,
                                    backgroundColor: isHit
                                      ? "rgba(46, 204, 113, 0.2)"
                                      : "transparent",
                                    borderRadius: 8,
                                    border: isHit
                                      ? "2px solid #2ecc71"
                                      : "none",
                                    position: "relative",
                                  }}>
                                  <ResultChip
                                    number={num}
                                    color={color}
                                    compact
                                  />
                                  {isHit && (
                                    <div
                                      style={{
                                        position: "absolute",
                                        top: -6,
                                        right: -6,
                                        backgroundColor: "#2ecc71",
                                        borderRadius: "50%",
                                        width: 16,
                                        height: 16,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 10,
                                      }}>
                                      ✓
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {h.targets.length > 10 && (
                              <span
                                style={{
                                  padding: "6px 10px",
                                  backgroundColor: "#3a3a3a",
                                  borderRadius: 6,
                                  fontSize: 11,
                                  color: "#c0c0c0",
                                  fontWeight: 500,
                                }}>
                                +{h.targets.length - 10} números
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* CSS para scrollbar customizada */}
          <style>{`
            .custom-scrollbar::-webkit-scrollbar {
              width: 8px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
              background: #2a2a2a;
              border-radius: 4px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background: #3498db;
              border-radius: 4px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: #5dade2;
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

export default App;
