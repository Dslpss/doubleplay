export default async (request, context) => {
  const WS_URL = context?.env?.PLAYNABETS_WS_URL || 'wss://play.soline.bet:5903/Game';

  function extractJsonStr(s) {
    if (!s || typeof s !== 'string') return null;
    const i = s.indexOf('{');
    const j = s.lastIndexOf('}');
    if (i !== -1 && j !== -1 && j > i) {
      return s.slice(i, j + 1);
    }
    return null;
  }

  const stream = new ReadableStream({
    start(controller) {
      const enc = (event, data) => {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        controller.enqueue(`event: ${event}\n`);
        controller.enqueue(`data: ${payload}\n\n`);
      };

      enc('status', { type: 'status', connected: false, ts: Date.now(), source: 'edge-ws' });

      let ws;
      let heartbeat;
      let lastKey = null;
      let stopped = false;

      const connect = () => {
        try {
          ws = new WebSocket(WS_URL);
        } catch (err) {
          enc('status', { type: 'status', connected: false, ts: Date.now(), error: String(err?.message || err) });
          setTimeout(() => { if (!stopped) connect(); }, 2000);
          return;
        }

        ws.onopen = () => {
          enc('status', { type: 'status', connected: true, ts: Date.now() });
          heartbeat = setInterval(() => enc('ping', { type: 'status', connected: true, ts: Date.now() }), 10000);
        };

        ws.onmessage = (ev) => {
          let text = '';
          try {
            if (typeof ev.data === 'string') text = ev.data;
            else if (ev.data) text = String(ev.data);
          } catch {}
          const jsonStr = extractJsonStr(text) || text;
          let payload = null;
          try { payload = JSON.parse(jsonStr); } catch {
            const nested = extractJsonStr(jsonStr);
            if (nested) { try { payload = JSON.parse(nested); } catch {} }
          }
          if (payload) {
            const key = JSON.stringify(payload).slice(0, 400);
            if (key !== lastKey) {
              lastKey = key;
              enc('double_result', { type: 'double_result', data: payload });
            }
          }
        };

        ws.onerror = (err) => {
          enc('status', { type: 'status', connected: false, ts: Date.now(), error: String(err?.message || err) });
        };

        ws.onclose = () => {
          enc('status', { type: 'status', connected: false, ts: Date.now() });
          if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
          if (!stopped) setTimeout(connect, 2000);
        };
      };

      connect();

      this.cancel = () => {
        stopped = true;
        if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
        try { ws?.close(); } catch {}
      };
    },
    cancel() { if (this.cancel) this.cancel(); }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      // Removido 'connection': 'keep-alive' por incompatibilidade com HTTP/2
    },
  });
};