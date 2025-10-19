import { useEffect, useRef, useState } from 'react';
import './App.css';
import { status, connectWsBridge } from './services/api';
import { createWsClient } from './services/wsClient';
import { parseDoublePayload, summarizeResults, computeStreaks, detectSimplePatterns } from './services/parser';
import ResultChip from './components/ResultChip';
import StatsPanel from './components/StatsPanel';
import PatternsPanel from './components/PatternsPanel';

function App() {

  const [serverStatus, setServerStatus] = useState({});
  const [events, setEvents] = useState([]);
  const [results, setResults] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    wsRef.current = createWsClient((data) => {
      setEvents((prev) => [data, ...prev].slice(0, 50));
      if (data?.type === 'status') {
        setServerStatus((prev) => ({ ...prev, wsConnected: Boolean(data?.connected) }));
      }
      if (data?.type === 'double_result') {
        const parsed = parseDoublePayload(data?.data ?? data);
        if (parsed) {
          setResults((prev) => [...prev, parsed].slice(-100));
        }
      }
    });
    // Autoconecta ao bridge PlayNaBets no carregamento
    (async () => {
      try {
        const res = await connectWsBridge();
        setEvents((prev) => [{ type: 'autoConnect', data: res }, ...prev].slice(0, 50));
      } catch (e) {
        setEvents((prev) => [{ type: 'autoConnectError', error: String(e) }, ...prev].slice(0, 50));
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
    const res = await connectWsBridge();
    setEvents((prev) => [{ type: 'connect', data: res }, ...prev]);
  };

  const connected = Boolean(serverStatus?.wsConnected);
  const hasToken = Boolean(serverStatus?.hasToken);
  const stats = summarizeResults(results);
  const streaks = computeStreaks(results);
  const patterns = detectSimplePatterns(results);

  return (
    <div className="App" style={{ padding: 24 }}>
      <h1>Analise double Play na Bet</h1>
      <p>Servidor: {connected ? 'WS conectado' : 'WS desconectado'} | Token: {hasToken ? 'OK' : 'Não'}</p>

      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>


        <div style={{ border: '1px solid #ccc', padding: 16, borderRadius: 8 }}>
          <h2>Conexão em tempo real</h2>
          <p>Conexão automática ao PlayNaBets.</p>
          <p>Status: {connected ? 'Conectado' : 'Desconectado'} <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginLeft: 8, background: connected ? '#2ecc71' : '#e74c3c' }} /></p>
          <button onClick={handleConnectWs}>Reconectar WS</button>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>Últimos Resultados</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {results.length === 0 ? (
            <p>Nenhum resultado ainda.</p>
          ) : (
            results.slice().reverse().map((r, idx) => (
              <ResultChip key={idx} number={r.number} color={r.color} />
            ))
          )}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <StatsPanel stats={stats} streaks={streaks} />
      </div>

      <div style={{ marginTop: 24 }}>
        <PatternsPanel patterns={patterns} />
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>Eventos recentes</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {events.map((e, i) => (
            <li key={i} style={{ border: '1px solid #eee', marginBottom: 8, padding: 8 }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(e, null, 2)}</pre>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default App;
