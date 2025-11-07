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
import RouletteStatsPanel from "./components/RouletteStatsPanel";
import RoulettePatternsPanel from "./components/RoulettePatternsPanel";
import LastOutcomeCard from "./components/LastOutcomeCard";
import SpinHitStatsCard from "./components/SpinHitStatsCard";
import {
  detectBestRouletteSignal,
  validateSignalOutcome,
  ADAPTIVE_RESET_STRATEGIES,
  setSignalCooldown,
} from "./services/roulette";
import DoubleEmbedPanel from "./components/DoubleEmbedPanel";
import RouletteEmbedPanel from "./components/RouletteEmbedPanel";
import DoublePatternsPanel from "./components/DoublePatternsPanel.jsx";
import { detectBestDoubleSignal } from "./services/double.js";
import {
  saveResult,
  getResults,
  saveSignal,
  getSignals,
  saveActiveSignal,
  getActiveSignal,
} from "./services/database.js";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || null;

function App() {
  const [serverStatus, setServerStatus] = useState({});
  const [results, setResults] = useState([]);
  const [roulette, setRoulette] = useState([]);
  const wsRef = useRef(null);
  const lastRouletteKeyRef = useRef(null);
  const MAX_RESULTS = 100;

  const [autoBetEnabled] = useState(false);
  const [lastAutoBetRound, setLastAutoBetRound] = useState(null);
  const [, setLastAutoBetStatus] = useState(null);
  const [lastPatternKey, setLastPatternKey] = useState(null);
  const [activeSignal, setActiveSignal] = useState(null);
  const [, setSignalHistory] = useState([]);
  // removed unused historyLimit state
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

  // Sinais inteligentes para Double
  const [bestDoubleSignal, setBestDoubleSignal] = useState(null);
  const [doubleResultsCountSinceSignal, setDoubleResultsCountSinceSignal] =
    useState(0);
  const lastDoubleValidatedResultRef = useRef(null);
  const doubleAttemptResultsRef = useRef([]); // armazena resultados por giro para o sinal atual (Double)
  const [noDoubleSignalMessage, setNoDoubleSignalMessage] = useState(null);
  const [doubleSignalsHistory, setDoubleSignalsHistory] = useState([]); // Histórico de sinais do Double
  const [lastDoubleSignalOutcome, setLastDoubleSignalOutcome] = useState(null); // Último resultado do sinal (Double)
  const lastOutcomeTimerRef = useRef(null);

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

  // Carregar dados iniciais do banco de dados
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Carregar resultados do Double
        const doubleResults = await getResults("double", 100);
        if (doubleResults && doubleResults.length > 0) {
          setResults(doubleResults);
        }

        // Carregar resultados da Roleta
        const rouletteResults = await getResults("roulette", 100);
        if (rouletteResults && rouletteResults.length > 0) {
          setRoulette(rouletteResults);
        }

        // Carregar histórico de sinais do Double
        const doubleSignals = await getSignals("double", 100);
        if (doubleSignals && doubleSignals.length > 0) {
          setDoubleSignalsHistory(doubleSignals);
        }

        // Carregar histórico de sinais da Roleta
        const rouletteSignals = await getSignals("roulette", 100);
        if (rouletteSignals && rouletteSignals.length > 0) {
          setRouletteSignalsHistory(rouletteSignals);
        }

        console.log("✅ Dados carregados do banco de dados");
      } catch (error) {
        console.error("❌ Erro ao carregar dados iniciais:", error);
        // Continuar normalmente mesmo se falhar - vai usar dados locais
      }
    };

    loadInitialData();
  }, []); // Executa apenas uma vez na montagem

  // Sincronização periódica RÁPIDA - busca novos dados do banco a cada 3 segundos
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      try {
        // Sincronizar resultados do Double
        const doubleResults = await getResults("double", 100);
        if (doubleResults && doubleResults.length > 0) {
          setResults((prev) => {
            // Só atualiza se houver diferença (para evitar re-renders desnecessários)
            const lastLocal = prev[prev.length - 1];
            const lastRemote = doubleResults[doubleResults.length - 1];
            if (
              !lastLocal ||
              !lastRemote ||
              lastLocal.timestamp !== lastRemote.timestamp
            ) {
              return doubleResults;
            }
            return prev;
          });
        }

        // Sincronizar resultados da Roleta
        const rouletteResults = await getResults("roulette", 100);
        if (rouletteResults && rouletteResults.length > 0) {
          setRoulette((prev) => {
            const lastLocal = prev[0];
            const lastRemote = rouletteResults[0];
            if (
              !lastLocal ||
              !lastRemote ||
              lastLocal.timestamp !== lastRemote.timestamp
            ) {
              return rouletteResults;
            }
            return prev;
          });
        }

        // Sincronizar histórico de sinais do Double
        const doubleSignals = await getSignals("double", 100);
        if (doubleSignals && doubleSignals.length > 0) {
          setDoubleSignalsHistory((prev) => {
            if (prev.length !== doubleSignals.length) {
              return doubleSignals;
            }
            return prev;
          });
        }

        // Sincronizar histórico de sinais da Roleta
        const rouletteSignals = await getSignals("roulette", 100);
        if (rouletteSignals && rouletteSignals.length > 0) {
          setRouletteSignalsHistory((prev) => {
            if (prev.length !== rouletteSignals.length) {
              return rouletteSignals;
            }
            return prev;
          });
        }

        // Sincronizar sinal ativo do Double - SEMPRE atualiza se diferente
        const activeDoubleSignal = await getActiveSignal("double");
        const isValidDoubleSignal = (sig) => {
          const color = sig?.suggestedBet?.color;
          return (
            sig?.suggestedBet?.type === "color" &&
            (color === "red" || color === "black")
          );
        };

        // Compara IDs ou timestamps para ver se mudou
        const currentId =
          bestDoubleSignal?.id || bestDoubleSignal?.timestamp || 0;
        const remoteId =
          activeDoubleSignal?.id || activeDoubleSignal?.timestamp || 0;

        if (activeDoubleSignal && !bestDoubleSignal) {
          // Não tem sinal local mas tem no banco - PEGAR IMEDIATAMENTE
          if (isValidDoubleSignal(activeDoubleSignal)) {
            console.log(
              "🔔 Sinal encontrado no banco, aplicando localmente!",
              activeDoubleSignal.description
            );
            setBestDoubleSignal(activeDoubleSignal);
            doubleAttemptResultsRef.current =
              activeDoubleSignal.attemptResults || [];
            setDoubleResultsCountSinceSignal(
              activeDoubleSignal.resultsCount || 0
            );
          } else {
            console.warn(
              "⚠️ Sinal inválido recebido para Double (sem cor red/black). Ignorando."
            );
          }
        } else if (
          activeDoubleSignal &&
          bestDoubleSignal &&
          currentId !== remoteId
        ) {
          // Sinal diferente no banco - ATUALIZAR
          if (isValidDoubleSignal(activeDoubleSignal)) {
            console.log("🔔 Sinal atualizado do banco!");
            setBestDoubleSignal(activeDoubleSignal);
            doubleAttemptResultsRef.current =
              activeDoubleSignal.attemptResults || [];
            setDoubleResultsCountSinceSignal(
              activeDoubleSignal.resultsCount || 0
            );
          } else {
            console.warn(
              "⚠️ Sinal remoto inválido para Double. Mantendo sinal local."
            );
          }
        } else if (!activeDoubleSignal && bestDoubleSignal) {
          // Sinal foi removido remotamente
          console.log("🔕 Sinal removido do banco");
          setBestDoubleSignal(null);
          doubleAttemptResultsRef.current = [];
          setDoubleResultsCountSinceSignal(0);
        }

        console.log("🔄 Dados sincronizados com o banco");
        
        // Sincronizar sinal ativo da Roleta
        const activeRouletteSignal = await getActiveSignal("roulette");
        const currentRouletteId =
          bestRouletteSignal?.id || bestRouletteSignal?.timestamp || 0;
        const remoteRouletteId =
          activeRouletteSignal?.id || activeRouletteSignal?.timestamp || 0;

        if (activeRouletteSignal && !bestRouletteSignal) {
          console.log(
            "🔔 Sinal de Roleta encontrado no banco, aplicando localmente!",
            activeRouletteSignal.description
          );
          setBestRouletteSignal(activeRouletteSignal);
          setCurrentSignalAttempts(
            (activeRouletteSignal.attemptResults || []).map((num, idx) => ({
              attemptNumber: idx + 1,
              resultNumber: Number(num),
              hit: Array.isArray(activeRouletteSignal.targets)
                ? activeRouletteSignal.targets.includes(Number(num))
                : false,
              timestamp: Date.now(),
            }))
          );
          setResultsCountSinceSignal(activeRouletteSignal.resultsCount || 0);
        } else if (activeRouletteSignal && bestRouletteSignal && currentRouletteId !== remoteRouletteId) {
          console.log("🔔 Sinal de Roleta atualizado do banco!");
          setBestRouletteSignal(activeRouletteSignal);
          setCurrentSignalAttempts(
            (activeRouletteSignal.attemptResults || []).map((num, idx) => ({
              attemptNumber: idx + 1,
              resultNumber: Number(num),
              hit: Array.isArray(activeRouletteSignal.targets)
                ? activeRouletteSignal.targets.includes(Number(num))
                : false,
              timestamp: Date.now(),
            }))
          );
          setResultsCountSinceSignal(activeRouletteSignal.resultsCount || 0);
        } else if (!activeRouletteSignal && bestRouletteSignal) {
          console.log("🔕 Sinal de Roleta removido do banco");
          setBestRouletteSignal(null);
          setCurrentSignalAttempts([]);
          setResultsCountSinceSignal(0);
        }
      } catch (error) {
        console.error("⚠️ Erro ao sincronizar dados:", error);
      }
    }, 3000); // A cada 3 segundos - TEMPO REAL

    return () => clearInterval(syncInterval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

            // Salvar novo resultado no banco de dados
            saveResult(parsed, "double").catch((err) => {
              console.error(
                "Erro ao salvar resultado do Double no banco:",
                err
              );
            });

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

          // Salvar resultado da roleta no banco de dados
          saveResult(normalized, "roulette").catch((err) => {
            console.error("Erro ao salvar resultado da Roleta no banco:", err);
          });

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
    // Priorizar trinca e desequilíbrio; não sugerir branco
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
    return null;
  }

  // Helpers de cor para UI do alerta de sinal
  // removed unused colorHex helper

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
      const baseFallback = { red: 46, black: 46 };
      const base =
        stats.total >= 10
          ? {
              red: Math.round(((stats.red || 0) / stats.total) * 100),
              black: Math.round(((stats.black || 0) / stats.total) * 100),
            }
          : baseFallback;

      const color = signal?.color || "red";
      let chance = base[color] || 0;

      const key = signal?.key;

      // Ajustes por padrão
      if (key === "triple_repeat") {
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
    setLastPatternKey(signal.key);
    setLastAutoBetRound(lastRes.round_id);
    setActiveSignal({
      key: signal.key,
      color: signal.color,
      fromRound: lastRes.round_id,
      number: lastRes.number,
      chance,
    });
    const colorPt = signal.color === "red" ? "vermelho" : "preto";
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
      // Ativar cooldown de emissão para impedir novos sinais até validação
      setSignalCooldown(Date.now());
      // Persistir sinal ativo da Roleta para recuperação em reloads
      saveActiveSignal(
        { ...signal, resultsCount: 0, attemptResults: [] },
        "roulette"
      ).catch((err) => {
        console.error("Erro ao salvar sinal ativo da Roleta:", err);
      });
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

  // ===============================
  // Sinais Inteligentes do Double
  // ===============================
  useEffect(() => {
    if (route === "#/roulette") return; // apenas no modo Double
    if (!results || results.length < 3) return;

    // Se já existe um sinal ativo, PARAR de buscar novos padrões
    // Aguardar a validação completa (3 tentativas ou acerto)
    if (bestDoubleSignal) {
      console.log(
        "⏸️ [DETECÇÃO PAUSADA] Aguardando validação do sinal ativo:",
        bestDoubleSignal.description
      );
      return;
    }

    console.log("🔍 [BUSCANDO PADRÃO] Analisando resultados...");
    const analysisResults = [...results]; // cronológico: mais recente no fim
    const signal = detectBestDoubleSignal(analysisResults, {});

    if (signal) {
      console.log(
        "🔔 [NOVO SINAL DETECTADO]:",
        signal.description,
        "Targets:",
        signal.targets
      );

      // Configurar sinal com todas as propriedades necessárias
      signal.wasDisplayed = true;
      signal.timestamp = Date.now(); // timestamp de quando foi detectado

      // Resetar estado de validação ANTES de definir o novo sinal
      doubleAttemptResultsRef.current = [];
      lastDoubleValidatedResultRef.current = null;
      setDoubleResultsCountSinceSignal(0);
      setLastDoubleSignalOutcome(null);
      setNoDoubleSignalMessage(null);

      // Agora definir o sinal (isso vai triggar a renderização)
      setBestDoubleSignal(signal);

      console.log(
        "✅ [SINAL DEFINIDO] Sinal configurado e pronto para validação"
      );

      // Salvar sinal ativo no banco para sincronização
      saveActiveSignal(signal, "double").catch((err) => {
        console.error("Erro ao salvar sinal ativo do Double:", err);
      });
    } else {
      if (results.length % 3 === 0) {
        setNoDoubleSignalMessage(
          "❌ Nenhum padrão forte detectado neste ciclo"
        );
        // Limpar mensagem de último resultado também, pois estamos em novo ciclo
        setLastDoubleSignalOutcome(null);
        setTimeout(() => setNoDoubleSignalMessage(null), 5000);
      }
    }
  }, [results, bestDoubleSignal, route]);

  // Limpar automaticamente o banner de resultado após alguns segundos
  useEffect(() => {
    if (lastDoubleSignalOutcome) {
      if (lastOutcomeTimerRef.current)
        clearTimeout(lastOutcomeTimerRef.current);
      lastOutcomeTimerRef.current = setTimeout(() => {
        setLastDoubleSignalOutcome(null);
        lastOutcomeTimerRef.current = null;
      }, 5000);
    }
    return () => {
      if (lastOutcomeTimerRef.current) {
        clearTimeout(lastOutcomeTimerRef.current);
        lastOutcomeTimerRef.current = null;
      }
    };
  }, [lastDoubleSignalOutcome]);

  // Validação de sinais do Double
  useEffect(() => {
    if (route === "#/roulette") return;

    // Não há sinal ativo para validar
    if (!bestDoubleSignal || !results || results.length === 0) {
      return;
    }

    console.log(
      "🔍 [VALIDATION] Checando novo resultado para sinal:",
      bestDoubleSignal.description
    );

    const latest = results[results.length - 1];
    const resultId = `${latest.timestamp}-${latest.number}`;
    const resultTimestamp = latest.timestamp || 0;
    const signalTimestamp = bestDoubleSignal.timestamp || 0;

    // Validar apenas resultados POSTERIORES ao sinal
    // Usar >= para garantir que o resultado é mais recente que o sinal
    if (resultTimestamp <= signalTimestamp) {
      console.log(
        "[Double Validation] ⏭️ Ignorando resultado anterior/igual ao sinal"
      );
      return;
    }

    // Evitar validar o mesmo resultado duas vezes
    if (lastDoubleValidatedResultRef.current === resultId) {
      console.log("[Double Validation] ⏭️ Resultado já validado anteriormente");
      return;
    }

    // Marcar como validado
    lastDoubleValidatedResultRef.current = resultId;

    // Incrementar contador de tentativas
    const newCount = doubleResultsCountSinceSignal + 1;
    const maxAttempts = bestDoubleSignal.validFor || 3;

    setDoubleResultsCountSinceSignal(newCount);

    // Registrar número desta tentativa
    doubleAttemptResultsRef.current.push(Number(latest.number));

    // Atualizar persistência do sinal ativo do Double com progresso
    saveActiveSignal(
      {
        ...bestDoubleSignal,
        resultsCount: newCount,
        attemptResults: [...doubleAttemptResultsRef.current],
      },
      "double"
    ).catch((err) => {
      console.error("Erro ao atualizar sinal ativo do Double:", err);
    });

    // Verificar se acertou
    const resultNumber = Number(latest.number);
    const targets = bestDoubleSignal.targets || [];
    const hit = targets.includes(resultNumber);

    console.log(`\n🎯 [TENTATIVA ${newCount}/${maxAttempts}]`);
    console.log(`   Número saiu: ${resultNumber}`);
    console.log(`   Targets: [${targets.join(", ")}]`);
    console.log(`   ${hit ? "✅ ACERTOU!" : "❌ ERROU"}`);
    console.log(`   wasDisplayed: ${bestDoubleSignal.wasDisplayed}\n`);

    if (hit) {
      // ✅ ACERTOU!
      const signalRecord = {
        id: resultId,
        hit: true,
        hitOnAttempt: newCount,
        description: bestDoubleSignal.description,
        confidence: bestDoubleSignal.confidence,
        timestamp: Date.now(),
        targets: bestDoubleSignal.targets || [],
        resultNumber: resultNumber,
        attempts: doubleAttemptResultsRef.current.map((num) => ({
          resultNumber: Number(num),
          hit: targets.includes(Number(num)),
        })),
        attemptResults: [...doubleAttemptResultsRef.current],
      };

      // Adicionar ao histórico
      setDoubleSignalsHistory((hist) => [signalRecord, ...hist]);

      // Mostrar banner de ACERTO no card
      setLastDoubleSignalOutcome({
        hit: true,
        hitOnAttempt: newCount,
        description: bestDoubleSignal.description,
        confidence: bestDoubleSignal.confidence,
        timestamp: Date.now(),
      });

      // Salvar no banco de dados
      saveSignal(signalRecord, "double").catch((err) => {
        console.error("Erro ao salvar sinal do Double:", err);
      });

      // Remover sinal ativo do banco
      saveActiveSignal(null, "double").catch((err) => {
        console.error("Erro ao remover sinal ativo do Double:", err);
      });

      console.log("🧹 Limpando sinal após ACERTO...");
      console.log("🔓 Sistema liberado para buscar novo padrão\n");

      // Limpar sinal e resetar estado - LIBERA para buscar novo padrão
      setBestDoubleSignal(null);
      setDoubleResultsCountSinceSignal(0);
      doubleAttemptResultsRef.current = [];
      lastDoubleValidatedResultRef.current = null;
    } else if (newCount >= maxAttempts) {
      // ❌ LOSS - todas as tentativas falharam
      console.log(`💔 LOSS após ${newCount} tentativas\n`);

      const signalRecord = {
        id: resultId,
        hit: false,
        hitOnAttempt: null,
        description: bestDoubleSignal.description,
        confidence: bestDoubleSignal.confidence,
        timestamp: Date.now(),
        targets: bestDoubleSignal.targets || [],
        resultNumber: resultNumber,
        attempts: doubleAttemptResultsRef.current.map((num) => ({
          resultNumber: Number(num),
          hit: targets.includes(Number(num)),
        })),
        attemptResults: [...doubleAttemptResultsRef.current],
      };

      // Adicionar ao histórico
      setDoubleSignalsHistory((hist) => [signalRecord, ...hist]);

      // Mostrar banner de ERRO no card
      setLastDoubleSignalOutcome({
        hit: false,
        hitOnAttempt: null,
        description: bestDoubleSignal.description,
        confidence: bestDoubleSignal.confidence,
        timestamp: Date.now(),
      });

      // Salvar no banco de dados
      saveSignal(signalRecord, "double").catch((err) => {
        console.error("Erro ao salvar sinal do Double:", err);
      });

      // Remover sinal ativo do banco
      saveActiveSignal(null, "double").catch((err) => {
        console.error("Erro ao remover sinal ativo do Double:", err);
      });

      console.log("🧹 Limpando sinal após LOSS...");
      console.log("🔓 Sistema liberado para buscar novo padrão\n");

      // Limpar sinal e resetar estado - LIBERA para buscar novo padrão
      setBestDoubleSignal(null);
      setDoubleResultsCountSinceSignal(0);
      doubleAttemptResultsRef.current = [];
      lastDoubleValidatedResultRef.current = null;
    } else {
      // Aguardando próximas tentativas
      console.log(
        `⏳ Aguardando próxima tentativa (${newCount}/${maxAttempts})\n`
      );
    }
  }, [results, bestDoubleSignal, route, doubleResultsCountSinceSignal]);

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

    // Validar resultado (SEM registrar aprendizado ainda)
    const hit = bestRouletteSignal.targets.includes(resultNum);

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

    // Atualizar persistência do sinal ativo com progresso
    saveActiveSignal(
      {
        ...bestRouletteSignal,
        resultsCount: newCount,
        attemptResults: [...currentSignalAttempts, attempt],
      },
      "roulette"
    ).catch((err) => {
      console.error("Erro ao atualizar sinal ativo da Roleta:", err);
    });

    // Limpar sinal IMEDIATAMENTE quando acerta OU quando expira
    if (hit) {
      console.log("[Signal] ✅ ACERTOU! Limpando sinal imediatamente.");
      console.log(
        `[Learning] Registrando ACERTO para padrão ${bestRouletteSignal.patternKey} no giro ${newCount}`
      );

      // ✅ REGISTRAR APRENDIZADO: Acertou em algum dos 3 giros
      validateSignalOutcome(bestRouletteSignal, resultNum);

      // Adicionar ao histórico com TODAS as tentativas
      const rouletteSignalRecord = {
        id: resultId,
        patternKey: bestRouletteSignal.patternKey,
        description: bestRouletteSignal.description,
        confidence: bestRouletteSignal.confidence,
        targets: bestRouletteSignal.targets,
        attempts: [...currentSignalAttempts, attempt], // Todas as tentativas (Martingale)
        hit: true,
        hitOnAttempt: newCount, // Em qual giro acertou
        timestamp: Date.now(),
      };

      setRouletteSignalsHistory((prev) =>
        [rouletteSignalRecord, ...prev].slice(0, 50)
      ); // Manter últimos 50

      // Salvar no banco de dados
      saveSignal(rouletteSignalRecord, "roulette").catch((err) => {
        console.error("Erro ao salvar sinal da Roleta no banco:", err);
      });

      // Remover sinal ativo persistido
      saveActiveSignal(null, "roulette").catch((err) => {
        console.error("Erro ao remover sinal ativo da Roleta:", err);
      });

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
      console.log(
        `[Learning] Registrando ERRO para padrão ${bestRouletteSignal.patternKey} - perdeu todas as 3 tentativas`
      );

      // ❌ REGISTRAR APRENDIZADO: Perdeu todas as 3 tentativas
      // Usar o resultado do último giro para registrar o erro
      validateSignalOutcome(bestRouletteSignal, resultNum);

      // Adicionar ao histórico com TODAS as tentativas (perdeu todas)
      const rouletteSignalRecord = {
        id: resultId,
        patternKey: bestRouletteSignal.patternKey,
        description: bestRouletteSignal.description,
        confidence: bestRouletteSignal.confidence,
        targets: bestRouletteSignal.targets,
        attempts: [...currentSignalAttempts, attempt], // Todas as 3 tentativas
        hit: false,
        hitOnAttempt: null, // Não acertou em nenhum giro
        timestamp: Date.now(),
      };

      setRouletteSignalsHistory((prev) =>
        [rouletteSignalRecord, ...prev].slice(0, 50)
      ); // Manter últimos 50

      // Salvar no banco de dados
      saveSignal(rouletteSignalRecord, "roulette").catch((err) => {
        console.error("Erro ao salvar sinal da Roleta no banco:", err);
      });

      // Remover sinal ativo persistido
      saveActiveSignal(null, "roulette").catch((err) => {
        console.error("Erro ao remover sinal ativo da Roleta:", err);
      });

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
        </div>
      )}

      <div
        style={{
          marginTop: 24,
          display: route !== "#/roulette" ? "block" : "none",
        }}>
        <StatsPanel stats={stats} streaks={streaks} />
      </div>

      {/* Card de Últimos Resultados - acima dos sinais inteligentes */}
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
                  gap: isNarrow ? 6 : 8,
                  flexWrap: "nowrap",
                  overflowX: "auto",
                  paddingBottom: 6,
                  justifyContent: isNarrow ? "flex-start" : "center",
                  scrollSnapType: isNarrow ? "x mandatory" : "none",
                  WebkitOverflowScrolling: "touch",
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

      {/* Card: Último Loss e Último Acerto (Double) */}
      {route !== "#/roulette" && (
        <div style={{ marginTop: 24 }}>
          <LastOutcomeCard
            title="Último Loss e Último Acerto"
            history={doubleSignalsHistory}
          />
          <div style={{ marginTop: 12 }}>
            <SpinHitStatsCard
              title="Estatísticas por Giro (Double)"
              history={doubleSignalsHistory}
            />
          </div>
        </div>
      )}

      {/* Card de Sinais Inteligentes do Double - abaixo dos últimos resultados */}
      {route !== "#/roulette" && (
        <div style={{ marginTop: 24 }}>
          <div
            style={{
              border: "1px solid rgb(204, 204, 204)",
              padding: 16,
              borderRadius: 8,
            }}>
            <h2>Sinais Inteligentes (Double)</h2>
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  border: "1px solid rgb(58, 58, 58)",
                  borderRadius: 8,
                  padding: 16,
                  backgroundColor: "rgb(31, 31, 31)",
                }}>
                <h3
                  style={{
                    marginTop: 0,
                    marginBottom: 16,
                    color: "rgb(236, 240, 241)",
                  }}>
                  Sinais do Double
                </h3>
                {(() => {
                  const nextSignalIn = bestDoubleSignal
                    ? null
                    : 3 - (results.length % 3);
                  return (
                    <DoublePatternsPanel
                      signal={bestDoubleSignal}
                      nextSignalIn={nextSignalIn}
                      noSignalMessage={noDoubleSignalMessage}
                      lastOutcome={lastDoubleSignalOutcome}
                      lastNumber={
                        results.length > 0
                          ? results[results.length - 1].number
                          : null
                      }
                    />
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Removido: Painel "Padrões Detectados" no modo Double */}

      {route !== "#/roulette" && (
        <div style={{ marginTop: 24 }}>
          <DoubleEmbedPanel />
        </div>
      )}

      {/* Card de Histórico de Sinais (Double) - abaixo do iframe */}
      {route !== "#/roulette" && (
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
              📊 Histórico de Sinais (Double)
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

            {doubleSignalsHistory.length === 0 ? (
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
                      {doubleSignalsHistory.length}
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
                      {doubleSignalsHistory.filter((h) => h.hit).length}
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
                      {doubleSignalsHistory.filter((h) => !h.hit).length}
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
                      {doubleSignalsHistory.length > 0
                        ? (
                            (doubleSignalsHistory.filter((h) => h.hit).length /
                              doubleSignalsHistory.length) *
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

                {/* Estatísticas Entre Losses */}
                {(() => {
                  const calculateLossStats = (history) => {
                    const losses = [];
                    const hitsSequences = [];
                    let currentHitSequence = [];

                    // Percorrer histórico do mais antigo para o mais recente
                    [...history].reverse().forEach((signal) => {
                      if (signal.hit) {
                        currentHitSequence.push(signal);
                      } else {
                        // Loss encontrado
                        losses.push(signal);
                        if (currentHitSequence.length > 0) {
                          hitsSequences.push(currentHitSequence.length);
                          currentHitSequence = [];
                        }
                      }
                    });

                    // Se terminou com uma sequência de acertos, adicionar
                    if (currentHitSequence.length > 0) {
                      hitsSequences.push(currentHitSequence.length);
                    }

                    const avgHitsBetweenLosses =
                      hitsSequences.length > 0
                        ? (
                            hitsSequences.reduce((a, b) => a + b, 0) /
                            hitsSequences.length
                          ).toFixed(1)
                        : 0;

                    const maxHitsBetweenLosses =
                      hitsSequences.length > 0 ? Math.max(...hitsSequences) : 0;

                    const minHitsBetweenLosses =
                      hitsSequences.length > 0 ? Math.min(...hitsSequences) : 0;

                    return {
                      totalLosses: losses.length,
                      hitsSequences,
                      avgHitsBetweenLosses,
                      maxHitsBetweenLosses,
                      minHitsBetweenLosses,
                      totalSequences: hitsSequences.length,
                    };
                  };

                  const lossStats = calculateLossStats(doubleSignalsHistory);

                  if (lossStats.totalLosses === 0) {
                    return null;
                  }

                  return (
                    <div
                      style={{
                        padding: 16,
                        backgroundColor: "#2a2a2a",
                        borderRadius: 8,
                        marginBottom: 20,
                        border: "1px solid #9b59b6",
                      }}>
                      <div
                        style={{
                          fontSize: 14,
                          color: "#ecf0f1",
                          fontWeight: 600,
                          marginBottom: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}>
                        <span>📊 Análise de Recuperação Entre Losses</span>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(140px, 1fr))",
                          gap: 12,
                        }}>
                        <div
                          style={{
                            padding: 12,
                            backgroundColor: "#1f1f1f",
                            borderRadius: 6,
                            border: "1px solid #3498db",
                          }}>
                          <div
                            style={{
                              fontSize: 20,
                              fontWeight: 700,
                              color: "#3498db",
                              textAlign: "center",
                            }}>
                            {lossStats.avgHitsBetweenLosses}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#c0c0c0",
                              marginTop: 4,
                              textAlign: "center",
                            }}>
                            Média de acertos entre losses
                          </div>
                        </div>

                        <div
                          style={{
                            padding: 12,
                            backgroundColor: "#1f1f1f",
                            borderRadius: 6,
                            border: "1px solid #2ecc71",
                          }}>
                          <div
                            style={{
                              fontSize: 20,
                              fontWeight: 700,
                              color: "#2ecc71",
                              textAlign: "center",
                            }}>
                            {lossStats.maxHitsBetweenLosses}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#c0c0c0",
                              marginTop: 4,
                              textAlign: "center",
                            }}>
                            Máximo de acertos seguidos
                          </div>
                        </div>

                        <div
                          style={{
                            padding: 12,
                            backgroundColor: "#1f1f1f",
                            borderRadius: 6,
                            border: "1px solid #e67e22",
                          }}>
                          <div
                            style={{
                              fontSize: 20,
                              fontWeight: 700,
                              color: "#e67e22",
                              textAlign: "center",
                            }}>
                            {lossStats.minHitsBetweenLosses}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#c0c0c0",
                              marginTop: 4,
                              textAlign: "center",
                            }}>
                            Mínimo de acertos entre losses
                          </div>
                        </div>

                        <div
                          style={{
                            padding: 12,
                            backgroundColor: "#1f1f1f",
                            borderRadius: 6,
                            border: "1px solid #9b59b6",
                          }}>
                          <div
                            style={{
                              fontSize: 20,
                              fontWeight: 700,
                              color: "#9b59b6",
                              textAlign: "center",
                            }}>
                            {lossStats.totalSequences}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#c0c0c0",
                              marginTop: 4,
                              textAlign: "center",
                            }}>
                            Ciclos analisados
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          padding: 10,
                          backgroundColor: "#1f1f1f",
                          borderRadius: 6,
                          fontSize: 11,
                          color: "#c0c0c0",
                          lineHeight: 1.5,
                        }}>
                        💡{" "}
                        <strong style={{ color: "#ffd700" }}>
                          Interpretação:
                        </strong>{" "}
                        Entre cada loss, você teve em média{" "}
                        <strong style={{ color: "#3498db" }}>
                          {lossStats.avgHitsBetweenLosses}
                        </strong>{" "}
                        acertos. Sua melhor sequência foi de{" "}
                        <strong style={{ color: "#2ecc71" }}>
                          {lossStats.maxHitsBetweenLosses}
                        </strong>{" "}
                        acertos consecutivos.
                      </div>
                    </div>
                  );
                })()}

                {/* Lista de confirmações de acerto/loss removida conforme solicitado */}
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

            {/* Card: Último Loss e Último Acerto (Roleta) */}
            <div style={{ marginTop: 16 }}>
              <LastOutcomeCard
                title="Último Loss e Último Acerto"
                history={rouletteSignalsHistory}
              />
              <div style={{ marginTop: 12 }}>
                <SpinHitStatsCard
                  title="Estatísticas por Giro (Roleta)"
                  history={rouletteSignalsHistory}
                />
              </div>
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
                            {h.attempts.slice(0, 3).map((attempt, idx) => {
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
                                    {idx === 0
                                      ? "🎯 Aposta Principal"
                                      : idx === 1
                                      ? "🔄 Gale 1"
                                      : "🔄🔄 Gale 2"}
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
                            {Array.isArray(h.targets) &&
                              h.targets.slice(0, 10).map((num) => {
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
                            {Array.isArray(h.targets) &&
                              h.targets.length > 10 && (
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
