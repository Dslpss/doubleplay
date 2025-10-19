const SERVER_URL = import.meta.env.VITE_SERVER_URL || null;

export function createWsClient(onMessage) {
  // Fallback para SSE quando SERVER_URL não está configurado
  if (!SERVER_URL) {
    try {
      const es = new EventSource('/events');
      es.onopen = () => {
        try { onMessage?.({ type: 'status', connected: true }); } catch {}
        console.log('[SSE] Conectado ao stream');
      };
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          onMessage?.(data);
        } catch {
          onMessage?.(ev.data);
        }
      };
      es.onerror = (e) => console.warn('[SSE] Erro', e);
      return { close() { es.close(); } };
    } catch (e) {
      console.warn('[SSE] indisponível', e);
      return { close() {} };
    }
  }

  // WS quando SERVER_URL está definido
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