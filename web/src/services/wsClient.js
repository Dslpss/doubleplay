const SERVER_URL = import.meta.env.VITE_SERVER_URL || null;

export function createWsClient(onMessage) {
  let active = null;
  const connectSSE = () => {
    try {
      const sseUrl = SERVER_URL ? `${SERVER_URL}/events` : "/events";
      try {
        console.log("[SSE] Connect to", sseUrl);
      } catch {}
      const es = new EventSource(sseUrl);
      es.onopen = () => {
        try {
          onMessage?.({ type: "status", connected: true });
        } catch {}
        console.log("[SSE] Conectado ao stream");
      };
      // Ouvir eventos nomeados do SSE
      es.addEventListener("status", (ev) => {
        try {
          onMessage?.(JSON.parse(ev.data));
        } catch {
          onMessage?.(ev.data);
        }
      });
      es.addEventListener("double_result", (ev) => {
        try {
          onMessage?.(JSON.parse(ev.data));
        } catch {
          onMessage?.(ev.data);
        }
      });
      es.addEventListener("roulette_result", (ev) => {
        try {
          onMessage?.(JSON.parse(ev.data));
        } catch {
          onMessage?.(ev.data);
        }
      });
      es.addEventListener("bets_popularity", (ev) => {
        try {
          onMessage?.(JSON.parse(ev.data));
        } catch {
          onMessage?.(ev.data);
        }
      });
      // Fallback genérico para eventos sem nome
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          const known = data && (data.type === 'double_result' || data.type === 'roulette_result' || data.type === 'bets_popularity' || data.type === 'status' || data.type === 'ping');
          if (known) return; // já tratado pelos listeners nomeados
          onMessage?.(data);
        } catch {
          onMessage?.(ev.data);
        }
      };
      es.onerror = (e) => console.warn("[SSE] Erro", e);
      active = { type: "sse", close: () => es.close() };
    } catch (e) {
      console.warn("[SSE] indisponível", e);
      active = { type: "none", close: () => {} };
    }
  };

  // Log URL de servidor para diagnóstico
  try {
    console.log("[WSClient] SERVER_URL", SERVER_URL);
  } catch {}

  if (!SERVER_URL) {
    connectSSE();
    return {
      close() {
        active?.close?.();
      },
    };
  }

  const wsUrl = SERVER_URL.replace(/^http/, "ws") + "/ws";
  try {
    console.log("[WSClient] Connect to", wsUrl);
  } catch {}
  const ws = new WebSocket(wsUrl);
  ws.onopen = () => console.log("[WS] Conectado ao bridge");
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      onMessage?.(data);
    } catch {
      onMessage?.(ev.data);
    }
  };
  ws.onclose = () => console.log("[WS] Desconectado do bridge");
  ws.onerror = (e) => {
    console.error("[WS] Erro", e);
    try {
      ws.close();
    } catch {}
    connectSSE();
  };
  active = { type: "ws", close: () => ws.close() };
  return {
    close() {
      active?.close?.();
    },
  };
}
