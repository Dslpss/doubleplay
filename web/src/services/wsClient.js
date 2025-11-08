const SERVER_URL = import.meta.env.VITE_SERVER_URL || null;

export function createWsClient(onMessage) {
  let active = null;
  const connectSSE = () => {
    try {
      const sseUrl = SERVER_URL ? `${SERVER_URL}/events` : "/events";
      try {
        console.log("[SSE] Connect to", sseUrl);
      } catch (e) {
        console.error(e);
      }
      const es = new EventSource(sseUrl);
      es.onopen = () => {
        try {
          onMessage?.({ type: "status", connected: true });
        } catch (e) {
          console.error(e);
        }
        console.log("[SSE] Conectado ao stream");
      };
      // Ouvir eventos nomeados do SSE
      es.addEventListener("status", (ev) => {
        try {
          onMessage?.(JSON.parse(ev.data));
        } catch (e) {
          console.error(e);
          onMessage?.(ev.data);
        }
      });
      es.addEventListener("double_result", (ev) => {
        try {
          onMessage?.(JSON.parse(ev.data));
        } catch (e) {
          console.error(e);
          onMessage?.(ev.data);
        }
      });
      es.addEventListener("bets_popularity", (ev) => {
        try {
          onMessage?.(JSON.parse(ev.data));
        } catch (e) {
          console.error(e);
          onMessage?.(ev.data);
        }
      });
      // Fallback genérico para eventos sem nome
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          const known =
            data &&
            (data.type === "double_result" ||
              data.type === "bets_popularity" ||
              data.type === "status" ||
              data.type === "ping");
          if (known) return; // já tratado pelos listeners nomeados
          onMessage?.(data);
        } catch (e) {
          console.error(e);
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
  } catch (e) {
    console.error(e);
  }

  // Se não há SERVER_URL configurado
  if (!SERVER_URL) {
    // Em desenvolvimento, sem SERVER_URL, evita conexão automática para não gerar erros de rede
    if (import.meta.env.DEV) {
      try {
        console.warn("[WSClient] DEV sem SERVER_URL; conexão desativada");
      } catch (e) {
        console.error(e);
      }
      active = { type: "none", close: () => {} };
      return {
        close() {
          active?.close?.();
        },
      };
    }
    // Em produção, tenta SSE relativo (Netlify Edge Functions)
    connectSSE();
    return {
      close() {
        active?.close?.();
      },
    };
  }

  // Se SERVER_URL está configurado, usa SSE direto (dev-server local ou servidor remoto)
  // Prioriza SSE sobre WebSocket para compatibilidade
  connectSSE();
  return {
    close() {
      active?.close?.();
    },
  };
}
