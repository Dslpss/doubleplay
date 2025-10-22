import { useEffect, useRef, useState } from 'react';
import './App.css';
import { status, connectWsBridge } from './services/api';
import { createWsClient } from './services/wsClient';
import { parseDoublePayload, summarizeResults, computeStreaks, detectSimplePatterns, summarizeRoulette, computeRouletteStreaks, detectRoulettePatterns } from './services/parser';
import ResultChip from './components/ResultChip';
import StatsPanel from './components/StatsPanel';
import PatternsPanel from './components/PatternsPanel';
import RouletteStatsPanel from './components/RouletteStatsPanel';
import RoulettePatternsPanel from './components/RoulettePatternsPanel';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || null;

function App() {

  const [serverStatus, setServerStatus] = useState({});
  const [results, setResults] = useState([]);
  const [roulette, setRoulette] = useState([]);
  const wsRef = useRef(null);
  const lastRouletteKeyRef = useRef(null);
  const MAX_RESULTS = 100;
  const [activeTab, setActiveTab] = useState('double');
  const [autoBetEnabled, setAutoBetEnabled] = useState(false);
  const [lastAutoBetRound, setLastAutoBetRound] = useState(null);
  const [lastAutoBetStatus, setLastAutoBetStatus] = useState(null);
  const [lastPatternKey, setLastPatternKey] = useState(null);
  const [activeSignal, setActiveSignal] = useState(null);
  const [signalHistory, setSignalHistory] = useState([]);
  const [historyLimit, setHistoryLimit] = useState(5);
  const [isNarrow, setIsNarrow] = useState(false);
  const [route, setRoute] = useState(window.location.hash || '#/');

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
      } catch {
        // silencioso
      }
      try {
        const [primary] = SERVER_URL ? [`${SERVER_URL}/api/roulette/start`] : ['/api/roulette/start'];
        await fetch(primary, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intervalMs: 2000 }) });
      } catch {}
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

  return (
    <div className="App" style={{ padding: 24 }}>
      <h1 style={{ fontSize: isNarrow ? 24 : undefined }}>
        {route === '#/roulette' ? 'Análise da Roleta (Pragmatic)' : 'Análise do Double (Play na Bet)'}
      </h1>
      <p>Servidor: {connected ? 'WS conectado' : 'WS desconectado'}{hasToken ? ' | Token: Ativo' : ''}</p>

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
        <h2>Roleta (Pragmatic) - Timeline</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {roulette.map((r, idx) => (
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
