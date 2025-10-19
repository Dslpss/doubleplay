const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

export function createWsClient(onMessage) {
  const wsUrl = SERVER_URL.replace(/^http/, 'ws') + '/ws';
  const ws = new WebSocket(wsUrl);
  ws.onopen = () => console.log('[WS] Conectado ao bridge');
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      onMessage?.(data);
    } catch {
      onMessage?.(ev.data);
    }
  };
  ws.onclose = () => console.log('[WS] Desconectado do bridge');
  ws.onerror = (e) => console.error('[WS] Erro', e);
  return ws;
}