import { useEffect, useRef, useState, useMemo } from 'react';
import './App.css';
import { status, connectWsBridge } from './services/api';
import { createWsClient } from './services/wsClient';
import { parseDoublePayload, summarizeResults, computeStreaks, detectSimplePatterns, summarizeRoulette, computeRouletteStreaks, detectRoulettePatterns } from './services/parser';
import ResultChip from './components/ResultChip';
import StatsPanel from './components/StatsPanel';
import PatternsPanel from './components/PatternsPanel';
import RouletteStatsPanel from './components/RouletteStatsPanel';
import RoulettePatternsPanel from './components/RoulettePatternsPanel';
import { detectRouletteAdvancedPatterns, chooseRouletteBetSignal, computeRouletteSignalChance, adviceLabelPt, rouletteColumn, rouletteDozen, rouletteHighLow, rouletteParity, integrateSignalMetrics, processSignalResult, ADAPTIVE_RESET_STRATEGIES } from './services/roulette';
import { testRoulettePatterns } from './test-roulette-patterns';

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
  const [route, setRoute] = useState(window.location.hash || '#/');
  const [autoRouletteEnabled, setAutoRouletteEnabled] = useState(false);
  const [lastRoulettePatternKey, setLastRoulettePatternKey] = useState(null);
  const [activeRouletteSignal, setActiveRouletteSignal] = useState(null);
  const [rouletteSignalHistory, setRouletteSignalHistory] = useState([]);
  const [rouletteHistoryLimit, setRouletteHistoryLimit] = useState(5);
  const [lastRouletteAdviceStatus, setLastRouletteAdviceStatus] = useState(null);
  const [enabledPatterns, setEnabledPatterns] = useState({
    column_triple: true,
    dozen_imbalance: true,
    highlow_streak: true,
    parity_streak: true,
    zero_proximity: true,
    red_black_balance: true,
    hot_numbers: true,
    sector_voisins: true,
    sector_tiers: true,
    sector_orphelins: true,
    sector_jeu_zero: true,
    neighbors_cluster: true,
    final_digit: true,
    final_digit_0: true,
    final_digit_1: true,
    final_digit_2: true,
    final_digit_3: true,
    final_digit_4: true,
    final_digit_5: true,
    final_digit_6: true,
    final_digit_7: true,
    final_digit_8: true,
    final_digit_9: true,
  });
  const [aggressiveMode, setAggressiveMode] = useState(false);
  const [rouletteMartingale, setRouletteMartingale] = useState(null);
  
  // Configurações de Reset Adaptativo
  const [resetStrategy, setResetStrategy] = useState(ADAPTIVE_RESET_STRATEGIES.FULL_RESET);
  const [windowSize, setWindowSize] = useState(50);
  const [changeThreshold, setChangeThreshold] = useState(0.3);
  const [maxLookback, setMaxLookback] = useState(100);
  const [recentWeight, setRecentWeight] = useState(0.7);
  const [maxRecent, setMaxRecent] = useState(15);
  const [maxHistorical, setMaxHistorical] = useState(35);
  const [lastRouletteAdviceFingerprint, setLastRouletteAdviceFingerprint] = useState(null);
  const [cooldownRounds, setCooldownRounds] = useState(1); // Reduzido de 3 para 1
  const [patternClearRounds, setPatternClearRounds] = useState(1); // Reduzido de 2 para 1
  const [lastRouletteAlertCount, setLastRouletteAlertCount] = useState(null);
  const [lastPatternAbsentStreak, setLastPatternAbsentStreak] = useState(0);
  const rouletteAdviceFingerprint = (adv) => {
    if (!adv) return null;
    // Incluir a chave do padrão no fingerprint para maior especificidade
    const baseFingerprint = (() => {
      switch (adv.type) {
        case 'color': return `color:${adv.color}`;
        case 'column': return `column:${adv.column}`;
        case 'dozen': return `dozen:${adv.dozen}`;
        case 'highlow': return `highlow:${adv.value}`;
        case 'parity': return `parity:${adv.value}`;
        case 'numbers': return `numbers:${(Array.isArray(adv.numbers) ? adv.numbers : []).join('-')}`;
        default: return adv.type;
      }
    })();
    // Adicionar a chave do padrão para maior especificidade
    return `${adv.key || 'unknown'}:${baseFingerprint}`;
  };

  // Janela para contagem de Finales
  const [finalesWindow] = useState(15);
  const rouletteFinalCounts = useMemo(() => {
    const counts = Array(10).fill(0);
    const lastN = roulette.slice(-finalesWindow);
    for (const r of lastN) {
      const n = Number(r.number);
      if (!Number.isFinite(n)) continue;
      counts[n % 10]++;
    }
    return counts;
  }, [roulette, finalesWindow]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 430px)');
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const updateRoute = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  useEffect(() => {
    wsRef.current = createWsClient((data) => {
      if (data?.type === 'status') {
        setServerStatus((prev) => ({ ...prev, wsConnected: Boolean(data?.connected) }));
      }
      if (data?.type === 'double_result') {
        const parsed = parseDoublePayload(data?.data ?? data);
        if (parsed) {
          setResults((prev) => {
            const last = prev[prev.length - 1];
            const duplicateById = parsed.round_id && prev.some(r => r.round_id === parsed.round_id);
            const sameRound = last && last.round_id && parsed.round_id && last.round_id === parsed.round_id;
            const sameRaw = last && last.raw && parsed.raw && JSON.stringify(last.raw) === JSON.stringify(parsed.raw);
            const sameNumTimeClose = last && last.number === parsed.number && Math.abs((parsed.timestamp || 0) - (last.timestamp || 0)) < 2000;
            if (duplicateById || sameRound || sameRaw || sameNumTimeClose) return prev;
            return [...prev, parsed].slice(-MAX_RESULTS);
          });
        }
      } else if (data?.type === 'roulette_result') {
        const item = data?.data ?? data;
        if (item && typeof item.number !== 'undefined') {
          const normalized = { ...item, timestamp: item.timestamp || item.ts || Date.now() };
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
      } catch { /* silencioso */ }
      // Inicia monitor da roleta apenas quando há backend externo configurado
      if (SERVER_URL) {
        try {
          await fetch(`${SERVER_URL}/api/roulette/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ intervalMs: 2000 }),
          });
        } catch { /* silencioso */ }
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

  // Teste dos padrões da roleta
  useEffect(() => {
    console.log('🧪 Executando teste dos padrões da roleta...');
    testRoulettePatterns();
  }, []);

  const handleConnectWs = async () => {
    await connectWsBridge();
  };

  const connected = Boolean(serverStatus?.wsConnected);
  const hasToken = Boolean(serverStatus?.hasToken);
  const stats = summarizeResults(results);
  const streaks = computeStreaks(results);
  const patterns = detectSimplePatterns(results);
  const rouletteStats = summarizeRoulette(roulette);
  const rouletteStreaks = computeRouletteStreaks(roulette);
  const roulettePatterns = detectRoulettePatterns(roulette);

  // limitar exibição a 4 pilhas (linhas), 16 resultados por linha
  const ROWS = 4;
  const PER_ROW = isNarrow ? 6 : 16;
  const last = results.slice(-(ROWS * PER_ROW));
  const lastNewestFirst = last.slice().reverse();
  const resultRows = Array.from({ length: ROWS }, (_, i) => lastNewestFirst.slice(i * PER_ROW, (i + 1) * PER_ROW));
  const ROW_HEIGHT = isNarrow ? 32 : 40;
  const GAP = 8;
  const resultsBoxHeight = (ROW_HEIGHT * ROWS) + GAP * (ROWS - 1) + 6;

  function chooseBetSignal(patterns, streaks, results) {
    if (!patterns || patterns.length === 0) return null;
    // Priorizar trinca e desequilíbrio antes do branco
    const triple = patterns.find(p => p.key === 'triple_repeat');
    if (triple && streaks?.current?.color) {
      return { color: (streaks.current.color === 'red' ? 'black' : 'red'), key: 'triple_repeat' };
    }
    const balance = patterns.find(p => p.key === 'red_black_balance');
    if (balance) {
      const stats20 = summarizeResults(results.slice(-20));
      if ((stats20.red || 0) > (stats20.black || 0)) return { color: 'red', key: 'red_black_balance' };
      if ((stats20.black || 0) > (stats20.red || 0)) return { color: 'black', key: 'red_black_balance' };
    }
    const white = patterns.find(p => p.key === 'white_proximity');
    if (white) return { color: 'white', key: 'white_proximity' };
    return null;
  }

  // Helpers de cor para UI do alerta de sinal
  const colorHex = { red: '#e74c3c', black: '#2c3e50', white: '#ecf0f1' };
  const colorLabelPt = (c) => (c === 'red' ? 'vermelho' : c === 'black' ? 'preto' : 'branco');
  const colorSquareStyle = (c) => ({
    display: 'inline-block',
    width: 16,
    height: 16,
    borderRadius: 3,
    background: colorHex[c],
    border: '1px solid rgba(0,0,0,0.2)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)'
  });

  useEffect(() => {
    const lastRes = results[results.length - 1];
    if (!lastRes || !autoBetEnabled) return;
    if (lastAutoBetRound && lastRes.round_id === lastAutoBetRound) return;
    const s = computeStreaks(results);
    const p = detectSimplePatterns(results);
    function computeSignalChance(signal, results) {
      const sample = results.slice(-50);
      const stats = summarizeResults(sample);
      const baseFallback = { red: 46, black: 46, white: 8 };
      const base = stats.total >= 10
        ? {
            red: Math.round(((stats.red || 0) / stats.total) * 100),
            black: Math.round(((stats.black || 0) / stats.total) * 100),
            white: Math.round(((stats.white || 0) / stats.total) * 100),
          }
        : baseFallback;
    
      const color = signal?.color || 'red';
      let chance = base[color] || 0;
    
      const key = signal?.key;
    
      // Ajustes por padrão
      if (key === 'white_proximity') {
        const recent10 = sample.slice(-10);
        const w10 = recent10.filter(r => r.color === 'white').length;
        chance += w10 >= 2 ? 5 : (w10 === 1 ? 3 : 0);
        if (stats.total >= 20 && (stats.white || 0) === 0) chance -= 2;
      } else if (key === 'triple_repeat') {
        const s = computeStreaks(results);
        chance += s.current?.length >= 3 ? 10 : 6;
      } else if (key === 'red_black_balance') {
        const last20 = results.slice(-20);
        const rr = last20.filter(r => r.color === 'red').length;
        const bb = last20.filter(r => r.color === 'black').length;
        const diff = Math.abs(rr - bb);
        chance += diff >= 5 ? 8 : (diff >= 3 ? 5 : 3);
      }
    
      // Limites
      chance = Math.max(4, Math.min(90, Math.round(chance)));
      return chance;
    }
    const signal = chooseBetSignal(p, s, results);
    if (!signal) { if (lastPatternKey) setLastPatternKey(null); return; }
    if (lastPatternKey === signal.key) return; // mesmo padrão ainda ativo, não repetir
    const chance = computeSignalChance(signal, results);
    // Limiar mínimo para branco para reduzir viés
    if (signal.key === 'white_proximity' && chance < 12) return;
    setLastPatternKey(signal.key);
    setLastAutoBetRound(lastRes.round_id);
    setActiveSignal({ key: signal.key, color: signal.color, fromRound: lastRes.round_id, number: lastRes.number, chance });
    const colorPt = signal.color === 'red' ? 'vermelho' : signal.color === 'black' ? 'preto' : 'branco';
    setLastAutoBetStatus(`Após número ${lastRes.number} aposte ${colorPt} (${chance}% de chance)`);
  }, [results, autoBetEnabled]);

  // Avalia o próximo resultado após um sinal e limpa o aviso
  useEffect(() => {
    if (!activeSignal) return;
    const lastRes = results[results.length - 1];
    if (!lastRes) return;
    if (lastRes.round_id === activeSignal.fromRound) return; // ainda no mesmo round do sinal
    const hit = lastRes.color === activeSignal.color;
    setLastAutoBetStatus(hit ? 'Acerto' : 'Erro');
    setSignalHistory(prev => [
      {
        round: lastRes.round_id,
        number: activeSignal.number ?? lastRes.number,
        color: activeSignal.color,
        key: activeSignal.key,
        result: hit ? 'acerto' : 'erro',
        time: Date.now(),
        chance: activeSignal.chance,
      },
      ...prev
    ].slice(0, 50));
    setActiveSignal(null);
    const t = setTimeout(() => setLastAutoBetStatus(null), 3000);
    return () => clearTimeout(t);
  }, [results, activeSignal]);

  // Sinais da Roleta (Pragmatic)
  useEffect(() => {
    const lastRes = roulette[0];
    if (!lastRes || !autoRouletteEnabled) return;
    if (activeRouletteSignal && lastRes.timestamp === activeRouletteSignal.fromTs) return;
    // Usa ordem cronológica crescente para análises (mais recente no fim)
    const analysisResults = [...roulette].reverse();
    const patternsR = detectRouletteAdvancedPatterns(analysisResults, { 
      aggressive: aggressiveMode,
      resetOptions: {
        strategy: resetStrategy,
        windowSize,
        changeThreshold,
        maxLookback,
        recentWeight,
        maxRecent,
        maxHistorical
      }
    });
    const streaksR = computeRouletteStreaks(roulette);
    const isEnabled = (p) => {
      if (enabledPatterns[p.key] !== undefined) return enabledPatterns[p.key];
      if (p.key.startsWith('final_digit_')) {
        return enabledPatterns[p.key] ?? enabledPatterns['final_digit'];
      }
      return false;
    };
    const allowedPatterns = patternsR.filter(isEnabled);
    // Atualiza streak de ausência do último padrão
    setLastPatternAbsentStreak(prev => {
      if (!lastRoulettePatternKey?.key) return 0;
      const stillDetected = allowedPatterns.some(p => p.key === lastRoulettePatternKey.key);
      return stillDetected ? 0 : Math.min(prev + 1, 999);
    });

    const signalR = chooseRouletteBetSignal(
      allowedPatterns,
      summarizeRoulette(roulette),
      streaksR,
      analysisResults,
      { 
        strategy: 'balanced', 
        lastKey: lastRoulettePatternKey?.key, 
        lastFingerprint: lastRouletteAdviceFingerprint, 
        randomizeTopDelta: 5,
        minQualityScore: aggressiveMode ? 2 : 3,
        minConfidence: aggressiveMode ? 0.3 : 0.4
      }
    );
    if (!signalR) { if (lastRoulettePatternKey) setLastRoulettePatternKey(null); return; }
    if (lastRoulettePatternKey?.key === signalR.key && lastRoulettePatternKey?.fromTs === lastRes.timestamp) return;

    const roundsSinceAlert = (lastRouletteAlertCount == null) ? Infinity : (roulette.length - lastRouletteAlertCount);
    const fpNew = rouletteAdviceFingerprint(signalR);
    
    // Verificação de cooldown para o mesmo fingerprint
    if (lastRouletteAdviceFingerprint && fpNew === lastRouletteAdviceFingerprint && roundsSinceAlert < cooldownRounds) {
      // Resfriamento: aguarda X rodadas antes de re-alertar mesmo fingerprint
      return;
    }

    // Verificação de pattern clear apenas para o mesmo padrão (não bloqueia padrões diferentes)
    if (lastRoulettePatternKey?.key === signalR.key && lastPatternAbsentStreak < patternClearRounds) {
      // Exige que o MESMO padrão anterior esteja ausente por Y rodadas consecutivas
      return;
    }

    const chance = computeRouletteSignalChance(signalR, analysisResults);
    
    // Integra métricas de performance no sinal
    const enhancedSignal = integrateSignalMetrics({ ...signalR, chance });
    
    setLastRoulettePatternKey({ key: signalR.key, fromTs: lastRes.timestamp });
    setActiveRouletteSignal({ ...enhancedSignal, fromTs: lastRes.timestamp, number: lastRes.number });
    setLastRouletteAdviceFingerprint(fpNew);
    setLastRouletteAlertCount(roulette.length);
    const label = adviceLabelPt(signalR);
    const performanceText = enhancedSignal.performance?.historicalHitRate 
      ? ` (${chance}% chance, ${enhancedSignal.performance.historicalHitRate}% histórico)`
      : ` (${chance}% chance)`;
    setLastRouletteAdviceStatus(`Após número ${lastRes.number} aposte ${label}${performanceText}`);
  }, [roulette, autoRouletteEnabled, aggressiveMode, lastPatternAbsentStreak, cooldownRounds, patternClearRounds]);

  useEffect(() => {
    if (!activeRouletteSignal) return;
    const lastRes = roulette[0];
    if (!lastRes) return;
    if (lastRes.timestamp === activeRouletteSignal.fromTs) return;
    const num = Number(lastRes.number);
    let hit = false;
    switch (activeRouletteSignal.type) {
      case 'color':
        hit = ((lastRes.color === 'green' ? 'green' : lastRes.color) === activeRouletteSignal.color);
        break;
      case 'column':
        hit = rouletteColumn(num) === activeRouletteSignal.column;
        break;
      case 'dozen':
        hit = rouletteDozen(num) === activeRouletteSignal.dozen;
        break;
      case 'highlow':
        hit = rouletteHighLow(num) === activeRouletteSignal.value;
        break;
      case 'parity':
        hit = rouletteParity(num) === activeRouletteSignal.value;
        break;
      case 'numbers':
        hit = Array.isArray(activeRouletteSignal.numbers) && activeRouletteSignal.numbers.includes(num);
        break;
      default:
        hit = false;
    }
    
    // Processa o resultado para atualizar métricas de performance
    if (activeRouletteSignal.performance?.signalIndex !== undefined) {
      processSignalResult(activeRouletteSignal.performance.signalIndex, num, activeRouletteSignal);
    }
    
    setLastRouletteAdviceStatus(hit ? 'Acerto' : 'Erro');
    setRouletteSignalHistory(prev => [
      {
        number: activeRouletteSignal.number ?? lastRes.number,
        type: activeRouletteSignal.type,
        value: adviceLabelPt(activeRouletteSignal),
        result: hit ? 'acerto' : 'erro',
        time: Date.now(),
        chance: activeRouletteSignal.chance,
        historicalHitRate: activeRouletteSignal.performance?.historicalHitRate,
        m1: null,
        m2: null,
      },
      ...prev
    ].slice(0, 50));
    if (!hit) {
      setRouletteMartingale({
        active: true,
        target: activeRouletteSignal,
        attemptsLeft: 2,
        index: 0,
        lastCheckedTs: lastRes.timestamp,
      });
    }
    setActiveRouletteSignal(null);
    const t = setTimeout(() => setLastRouletteAdviceStatus(null), 3000);
    return () => clearTimeout(t);
  }, [roulette, activeRouletteSignal]);

  useEffect(() => {
    if (!rouletteMartingale?.active) return;
    const lastRes = roulette[0];
    if (!lastRes) return;
    if (lastRes.timestamp === rouletteMartingale.lastCheckedTs) return;
    const num = Number(lastRes.number);
    let hit = false;
    switch (rouletteMartingale.target.type) {
      case 'color':
        hit = ((lastRes.color === 'green' ? 'green' : lastRes.color) === rouletteMartingale.target.color);
        break;
      case 'column':
        hit = rouletteColumn(num) === rouletteMartingale.target.column;
        break;
      case 'dozen':
        hit = rouletteDozen(num) === rouletteMartingale.target.dozen;
        break;
      case 'highlow':
        hit = rouletteHighLow(num) === rouletteMartingale.target.value;
        break;
      case 'parity':
        hit = rouletteParity(num) === rouletteMartingale.target.value;
        break;
      case 'numbers':
        hit = Array.isArray(rouletteMartingale.target.numbers) && rouletteMartingale.target.numbers.includes(num);
        break;
      default:
        hit = false;
    }

    const isM1 = rouletteMartingale.attemptsLeft === 2;
    setRouletteSignalHistory(prev => prev.map((h, idx) => {
      if (idx !== rouletteMartingale.index) return h;
      return {
        ...h,
        [isM1 ? 'm1' : 'm2']: hit ? 'acerto' : 'erro',
      };
    }));

    if (hit) {
      setLastRouletteAdviceStatus(isM1 ? 'Recuperado (Martingale M1)' : 'Recuperado (Martingale M2)');
      setRouletteMartingale(null);
      const t = setTimeout(() => setLastRouletteAdviceStatus(null), 3000);
      return () => clearTimeout(t);
    } else {
      const attemptsLeft = rouletteMartingale.attemptsLeft - 1;
      if (attemptsLeft <= 0) {
        setLastRouletteAdviceStatus('Falha (Martingale M2)');
        setRouletteMartingale(null);
        const t = setTimeout(() => setLastRouletteAdviceStatus(null), 3000);
        return () => clearTimeout(t);
      } else {
        setRouletteMartingale({
          ...rouletteMartingale,
          attemptsLeft,
          lastCheckedTs: lastRes.timestamp,
        });
      }
    }
  }, [roulette, rouletteMartingale]);

  return (
    <div className="App" style={{ padding: 24 }}>
      <h1 style={{ fontSize: isNarrow ? 24 : undefined }}>
        {route === '#/roulette' ? 'Análise da Roleta (Pragmatic)' : 'Análise do Double (Play na Bet)'}
      </h1>
      <p>Servidor: {connected ? 'WS conectado' : 'WS desconectado'}{hasToken ? ' | Token: Ativo' : ''}</p>

      {route === '#/roulette' && (
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <a
            href="https://playnabets.com/live-casino/pragmatic/237"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <button style={{ padding: '6px 12px', borderRadius: 6, background: '#1f2937', color: '#fff', border: '1px solid #374151' }}>
              Abrir roleta na Play na Bets
            </button>
          </a>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
        <a href="#/" style={{ textDecoration: 'none' }}>
          <button style={{ padding: '6px 12px', borderRadius: 6, background: route !== '#/roulette' ? '#2c3e50' : '#1f2937', color: '#fff', border: '1px solid #374151' }}>Double</button>
        </a>
        <a href="#/roulette" style={{ textDecoration: 'none' }}>
          <button style={{ padding: '6px 12px', borderRadius: 6, background: route === '#/roulette' ? '#2c3e50' : '#1f2937', color: '#fff', border: '1px solid #374151' }}>Roleta</button>
        </a>
      </div>

      {route !== '#/roulette' && (
        <div className="panels" style={{ display: 'flex', gap: 16, marginTop: 16, justifyContent: 'center' }}>
          <div style={{ border: '1px solid #ccc', padding: 16, borderRadius: 8 }}>
            <h2>Conexão em tempo real</h2>
            <p>Conexão automática ao Play na Bet.</p>
            <p>Status: {connected ? 'Conectado' : 'Desconectado'} <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginLeft: 8, background: connected ? '#2ecc71' : '#e74c3c' }} /></p>
            <button onClick={handleConnectWs} style={{ width: isNarrow ? '100%' : undefined }}>Reconectar WS</button>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', flexDirection: isNarrow ? 'column' : 'row', width: isNarrow ? '100%' : undefined }}>
              <span style={{ opacity: 0.8 }}>Não tem conta?</span>
              <a href="https://playnabets.com/cadastro?refId=NjMzMTRyZWZJZA==" target="_blank" rel="noopener noreferrer" style={{ width: isNarrow ? '100%' : undefined }}>
                <button style={{ width: isNarrow ? '100%' : undefined }}>Cadastre-se na Play na Bets</button>
              </a>
            </div>
          </div>

          <div style={{ border: '1px solid #ccc', padding: 16, borderRadius: 8 }}>
             <h2>Auto aposta (sinal)</h2>
             <p>Estado: {autoBetEnabled ? 'Ativa' : 'Desativada'}</p>
             <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => setAutoBetEnabled(v => !v)} style={{ width: isNarrow ? '100%' : undefined }}>{autoBetEnabled ? 'Desativar sinais' : 'Ativar sinais'}</button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ opacity: 0.8 }}>Mostrar</span>
                  <select value={historyLimit} onChange={(e) => setHistoryLimit(Number(e.target.value))}>
                    {[3,5,10,15].map(n => (<option key={n} value={n}>{n}</option>))}
                  </select>
                  <span style={{ opacity: 0.8 }}>sinais</span>
                </label>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#c0392b' }}>
                ⚠️ Você pode aplicar Martingale 2 (até duas entradas de recuperação),
                por sua conta e risco. Os sinais são apenas visuais e não automatizam
                valor nem execução de apostas.
              </div>
             {lastAutoBetStatus ? (
               <div style={{ marginTop: 8 }}>
                 {activeSignal ? (
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                     <span style={colorSquareStyle(activeSignal.color)} />
                     <span style={{ color: colorHex[activeSignal.color], fontWeight: 600 }}>
                       {colorLabelPt(activeSignal.color)}
                     </span>
                     <span style={{ opacity: 0.8, fontSize: 12 }}>chance {activeSignal.chance}%</span>
                   </div>
                 ) : null}
                 <p style={{ marginTop: 4, opacity: 0.85, color: activeSignal ? (activeSignal.color === 'black' ? '#ecf0f1' : colorHex[activeSignal.color]) : undefined }}>{lastAutoBetStatus}</p>
               </div>
             ) : null}

             <div style={{ marginTop: 12 }}>
               <div style={{ fontWeight: 600 }}>Histórico</div>
               {signalHistory.length === 0 ? (
                 <p style={{ opacity: 0.7 }}>Nenhum sinal ainda.</p>
               ) : (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                   {signalHistory.slice(0, historyLimit).map((h, i) => (
                     <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                       <span style={colorSquareStyle(h.color)} />
                       <span style={{ color: colorHex[h.color], fontWeight: 600 }}>{colorLabelPt(h.color)}</span>
                       <span style={{ opacity: 0.8 }}>após número {h.number}</span>
                       <span style={{ opacity: 0.6, fontSize: 12 }}>{new Date(h.time).toLocaleTimeString()}</span>
                       <span style={{ marginLeft: 'auto', fontWeight: 600, color: h.result === 'acerto' ? '#2ecc71' : '#e74c3c' }}>{h.result}</span>
                     </div>
                   ))}
                 </div>
               )}
             </div>
           </div>
        </div>
      )}

      <div style={{ marginTop: 24, display: route !== '#/roulette' ? 'block' : 'none' }}>
        <h2>Últimos Resultados</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: resultsBoxHeight, maxHeight: resultsBoxHeight, overflow: 'hidden' }}>
          {results.length === 0 ? (
            <p>Nenhum resultado ainda.</p>
          ) : (
            resultRows.map((row, ridx) => (
              <div key={ridx} style={{ display: 'flex', gap: 8, flexWrap: isNarrow ? 'wrap' : 'nowrap', overflowX: isNarrow ? 'hidden' : 'auto', paddingBottom: 6, justifyContent: 'center' }}>
                {row.map((r, idx) => (
                  <ResultChip key={`${ridx}-${idx}`} number={r.number} color={r.color} compact={isNarrow} />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ marginTop: 24, display: route !== '#/roulette' ? 'block' : 'none' }}>
        <StatsPanel stats={stats} streaks={streaks} />
      </div>


      <div style={{ marginTop: 24, display: route !== '#/roulette' ? 'block' : 'none' }}>
        <PatternsPanel patterns={patterns} />
      </div>

      <div style={{ marginTop: 24, display: route === '#/roulette' ? 'block' : 'none' }}>
        <RouletteStatsPanel stats={rouletteStats} streaks={rouletteStreaks} />
      </div>

      <div style={{ marginTop: 24, display: route === '#/roulette' ? 'block' : 'none' }}>
        <RoulettePatternsPanel patterns={roulettePatterns} />
      </div>

      <div style={{ marginTop: 24, display: route === '#/roulette' ? 'block' : 'none' }}>
        <div className="panels" style={{ display: 'flex', gap: 16, marginTop: 16, justifyContent: 'center' }}>
          <div style={{ border: '1px solid #ccc', padding: 16, borderRadius: 8 }}>
            <h2>Auto aposta (sinal) - Roleta</h2>
            <p>Estado: {autoRouletteEnabled ? 'Ativa' : 'Desativada'}</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setAutoRouletteEnabled(v => !v)} style={{ width: isNarrow ? '100%' : undefined }}>{autoRouletteEnabled ? 'Desativar sinais' : 'Ativar sinais'}</button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ opacity: 0.8 }}>Mostrar</span>
                <select value={rouletteHistoryLimit} onChange={(e) => setRouletteHistoryLimit(Number(e.target.value))}>
                  {[3,5,10,15].map(n => (<option key={n} value={n}>{n}</option>))}
                </select>
                <span style={{ opacity: 0.8 }}>sinais</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={aggressiveMode} onChange={() => setAggressiveMode(v => !v)} />
                <span style={{ opacity: 0.8 }}>Modo agressivo</span>
              </label>
              </div>
            
            {/* Configurações de Reset Adaptativo */}
            <div style={{ marginTop: 12, padding: 12, backgroundColor: '#1f1f1f', borderRadius: 6, border: '1px solid #3a3a3a' }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14, color: '#ecf0f1' }}>🔄 Reset Adaptativo</div>
              <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr', gap: 8, fontSize: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ opacity: 0.9, color: '#ecf0f1' }}>Estratégia:</span>
                  <select 
                    value={resetStrategy} 
                    onChange={(e) => setResetStrategy(e.target.value)}
                    style={{ padding: 4, fontSize: 12 }}
                  >
                    <option value={ADAPTIVE_RESET_STRATEGIES.FULL_RESET}>Reset Completo</option>
                    <option value={ADAPTIVE_RESET_STRATEGIES.SLIDING_WINDOW}>Janela Deslizante</option>
                    <option value={ADAPTIVE_RESET_STRATEGIES.CONDITIONAL_RESET}>Reset Condicional</option>
                    <option value={ADAPTIVE_RESET_STRATEGIES.HYBRID}>Híbrido</option>
                  </select>
                </label>
                
                {resetStrategy === ADAPTIVE_RESET_STRATEGIES.SLIDING_WINDOW && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ opacity: 0.9, color: '#ecf0f1' }}>Tamanho da Janela:</span>
                    <input 
                      type="number" 
                      value={windowSize} 
                      onChange={(e) => setWindowSize(Number(e.target.value))}
                      min="10" max="200" step="10"
                      style={{ padding: 4, fontSize: 12 }}
                    />
                  </label>
                )}
                
                {resetStrategy === ADAPTIVE_RESET_STRATEGIES.CONDITIONAL_RESET && (
                  <>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ opacity: 0.9, color: '#ecf0f1' }}>Limite de Mudança:</span>
                      <input 
                        type="number" 
                        value={changeThreshold} 
                        onChange={(e) => setChangeThreshold(Number(e.target.value))}
                        min="0.1" max="1" step="0.1"
                        style={{ padding: 4, fontSize: 12 }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ opacity: 0.9, color: '#ecf0f1' }}>Máx. Histórico:</span>
                      <input 
                        type="number" 
                        value={maxLookback} 
                        onChange={(e) => setMaxLookback(Number(e.target.value))}
                        min="50" max="500" step="50"
                        style={{ padding: 4, fontSize: 12 }}
                      />
                    </label>
                  </>
                )}
                
                {resetStrategy === ADAPTIVE_RESET_STRATEGIES.HYBRID && (
                  <>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ opacity: 0.9, color: '#ecf0f1' }}>Peso Recente:</span>
                      <input 
                        type="number" 
                        value={recentWeight} 
                        onChange={(e) => setRecentWeight(Number(e.target.value))}
                        min="0.1" max="1" step="0.1"
                        style={{ padding: 4, fontSize: 12 }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ opacity: 0.9, color: '#ecf0f1' }}>Máx. Recente:</span>
                      <input 
                        type="number" 
                        value={maxRecent} 
                        onChange={(e) => setMaxRecent(Number(e.target.value))}
                        min="5" max="50" step="5"
                        style={{ padding: 4, fontSize: 12 }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ opacity: 0.9, color: '#ecf0f1' }}>Máx. Histórico:</span>
                      <input 
                        type="number" 
                        value={maxHistorical} 
                        onChange={(e) => setMaxHistorical(Number(e.target.value))}
                        min="10" max="100" step="10"
                        style={{ padding: 4, fontSize: 12 }}
                      />
                    </label>
                  </>
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#c0c0c0', fontStyle: 'italic' }}>
                {resetStrategy === ADAPTIVE_RESET_STRATEGIES.FULL_RESET && 'Reinicia análise após cada sinal bem-sucedido'}
                {resetStrategy === ADAPTIVE_RESET_STRATEGIES.SLIDING_WINDOW && 'Usa apenas os últimos N resultados'}
                {resetStrategy === ADAPTIVE_RESET_STRATEGIES.CONDITIONAL_RESET && 'Reinicia quando detecta mudança significativa nos padrões'}
                {resetStrategy === ADAPTIVE_RESET_STRATEGIES.HYBRID && 'Combina resultados recentes e históricos com pesos diferentes'}
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#c0392b' }}>
              ⚠️ Os sinais são visuais e sugerem cor/coluna/dúzia/números com base em padrões. Use por sua conta e risco.
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Padrões habilitados</div>
              <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr', gap: 8 }}>
                {[
                  { key: 'column_triple', label: 'Trinca de coluna' },
                  { key: 'dozen_imbalance', label: 'Desequilíbrio de dúzia' },
                  { key: 'highlow_streak', label: 'Sequência alta/baixa' },
                  { key: 'parity_streak', label: 'Sequência de paridade' },
                  { key: 'zero_proximity', label: 'Zero recente' },
                  { key: 'red_black_balance', label: 'Desequilíbrio vermelho/preto' },
                  { key: 'hot_numbers', label: 'Números quentes' },
                  { key: 'sector_voisins', label: 'Setor: Voisins du Zéro' },
                  { key: 'sector_tiers', label: 'Setor: Tiers du Cylindre' },
                  { key: 'sector_orphelins', label: 'Setor: Orphelins' },
                  { key: 'sector_jeu_zero', label: 'Setor: Jeu Zéro' },
                  { key: 'neighbors_cluster', label: 'Cluster de vizinhos' },
                ].map(item => (
                  <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={enabledPatterns[item.key]} onChange={() => setEnabledPatterns(prev => ({ ...prev, [item.key]: !prev[item.key] }))} />
                    <span style={{ opacity: 0.85 }}>{item.label}</span>
                  </label>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr', gap: 8, marginTop: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ opacity: 0.85 }}>Cooldown (rodadas)</span>
                  <input type="number" min={0} step={1} value={cooldownRounds} onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setCooldownRounds(Number.isFinite(v) && v >= 0 ? v : 0);
                  }} style={{ width: 80 }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ opacity: 0.85 }}>Ausência necessária (Y rodadas)</span>
                  <input type="number" min={0} step={1} value={patternClearRounds} onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setPatternClearRounds(Number.isFinite(v) && v >= 0 ? v : 0);
                  }} style={{ width: 80 }} />
                </label>
              </div>

              <div style={{ opacity: 0.85, fontWeight: 600, marginTop: 10 }}>Finales por dígito</div>
              <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 8, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={enabledPatterns['final_digit']} onChange={() => setEnabledPatterns(prev => {
                    const next = !prev['final_digit'];
                    const updates = {};
                    for (let d = 0; d <= 9; d++) updates[`final_digit_${d}`] = next;
                    return { ...prev, final_digit: next, ...updates };
                  })} />
                  <span style={{ opacity: 0.85 }}>Finales (todos)</span>
                </label>
                {[0,1,2,3,4,5,6,7,8,9].map(d => (
                  <label key={`final_digit_${d}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={enabledPatterns[`final_digit_${d}`]} onChange={() => setEnabledPatterns(prev => ({ ...prev, [`final_digit_${d}`]: !prev[`final_digit_${d}`] }))} />
                    <span style={{ opacity: 0.85 }}>{`Final ${d}`}</span>
                    <span style={{ opacity: 0.6, fontSize: 12 }}>({rouletteFinalCounts[d]})</span>
                  </label>
                ))}
              </div>

              <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>M1/M2: indicadores aparecem no histórico ao aplicar recuperação.</div>
            </div>
            {lastRouletteAdviceStatus ? (
              <div style={{ marginTop: 8 }}>
                {activeRouletteSignal ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {activeRouletteSignal.type === 'color' ? (
                      <span style={colorSquareStyle(activeRouletteSignal.color)} />
                    ) : (
                      <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, background: '#374151', color: '#fff', fontSize: 12 }}>
                        {adviceLabelPt(activeRouletteSignal)}
                      </span>
                    )}
                    <span style={{ opacity: 0.8, fontSize: 12 }}>chance {activeRouletteSignal.chance}%</span>
                  </div>
                ) : null}
                <p style={{ marginTop: 4, opacity: 0.85 }}>{lastRouletteAdviceStatus}</p>
              </div>
            ) : null}

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600 }}>Histórico</div>
                {rouletteSignalHistory.length === 0 ? (
                  <p style={{ opacity: 0.7 }}>Nenhum sinal ainda.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rouletteSignalHistory.slice(0, rouletteHistoryLimit).map((h, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, background: '#374151', color: '#fff', fontSize: 12 }}>{h.value}</span>
                        <span style={{ opacity: 0.8 }}>após número {h.number}</span>
                        <span style={{ opacity: 0.6, fontSize: 12 }}>{new Date(h.time).toLocaleTimeString()}</span>
                        {h.m1 && (
                          <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, background: h.m1 === 'acerto' ? '#2ecc71' : '#e74c3c', color: '#fff', fontSize: 12 }}>M1 {h.m1}</span>
                        )}
                        {h.m2 && (
                          <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, background: h.m2 === 'acerto' ? '#2ecc71' : '#e74c3c', color: '#fff', fontSize: 12 }}>M2 {h.m2}</span>
                        )}
                        <span style={{ marginLeft: 'auto', fontWeight: 600, color: h.result === 'acerto' ? '#2ecc71' : '#e74c3c' }}>{h.result}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      <div style={{ marginTop: 24, display: route === '#/roulette' ? 'block' : 'none' }}>
        <h2>Roleta (Pragmatic) - Timeline</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {roulette.slice(0, 20).map((r, idx) => (
            <div
              key={`${r.timestamp || r.id || 'r'}_${idx}`}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 14,
                background: r.color === 'red' ? '#e11d48' : r.color === 'black' ? '#111827' : '#10b981',
                border: '1px solid rgba(255,255,255,0.15)'
              }}
              title={`${r.number} (${r.color})`}
            >
              {r.number}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

export default App;
