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

  function normalizeResult(obj) {
    try {
      const raw = obj?.data ?? obj;
      const out = typeof raw === 'object' ? { ...raw } : { raw };
      // Coletar número do resultado em diversos campos
      const candidates = [out.value, out.number, out.n, out.roll, out.result];
      for (const c of candidates) {
        if (c !== undefined && c !== null) {
          const num = Number(c);
          if (Number.isFinite(num)) { out.value = num; break; }
        }
      }
      // Normalizar round_id
      out.round_id = out.round_id ?? out.roundId ?? out.gameId;
      // Timestamp: usar timestamp/dateutc quando possível
      const dt = out.timestamp ?? out.dateutc;
      if (dt !== undefined && dt !== null) {
        const n = Number(dt);
        if (Number.isFinite(n)) {
          // Se parecer segundos, multiplicar para ms; se negativo, cair para Date.now()
          out.timestamp = n > 1e12 ? n : (n >= 0 ? n * 1000 : Date.now());
        }
      } else {
        out.timestamp = Date.now();
      }
      return out;
    } catch {
      return obj;
    }
  }

  let ws;
  let heartbeat;
  let lastKey = null;
  let stopped = false;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event, data) => {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        const chunk = `event: ${event}\n` + `data: ${payload}\n\n`;
        controller.enqueue(encoder.encode(chunk));
      };
      const sendDefault = (data) => {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        const chunk = `data: ${payload}\n\n`;
        controller.enqueue(encoder.encode(chunk));
      };

      send('status', { type: 'status', connected: false, ts: Date.now(), source: 'edge-ws' });
      sendDefault({ type: 'status', connected: false, ts: Date.now(), source: 'edge-ws' });

      const connect = () => {
        try {
          ws = new WebSocket(WS_URL);
        } catch (err) {
          const errPayload = { type: 'status', connected: false, ts: Date.now(), error: String(err?.message || err) };
          send('status', errPayload);
          sendDefault(errPayload);
          setTimeout(() => { if (!stopped) connect(); }, 2000);
          return;
        }

        ws.onopen = () => {
          const okPayload = { type: 'status', connected: true, ts: Date.now() };
          send('status', okPayload);
          sendDefault(okPayload);
          heartbeat = setInterval(() => {
            const pingPayload = { type: 'status', connected: true, ts: Date.now() };
            send('ping', pingPayload);
            sendDefault(pingPayload);
          }, 10000);
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
            const normalized = normalizeResult(payload);
            const key = JSON.stringify(normalized).slice(0, 400);
            if (key !== lastKey) {
              lastKey = key;
              const resultPayload = { type: 'double_result', data: normalized };
              send('double_result', resultPayload);
              sendDefault(resultPayload); // fallback compatível com clientes que usam onmessage
            }
          }
        };

        ws.onerror = (err) => {
          const errPayload = { type: 'status', connected: false, ts: Date.now(), error: String(err?.message || err) };
          send('status', errPayload);
          sendDefault(errPayload);
        };

        ws.onclose = () => {
          const closePayload = { type: 'status', connected: false, ts: Date.now() };
          send('status', closePayload);
          sendDefault(closePayload);
          if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
          if (!stopped) setTimeout(connect, 2000);
        };
      };

      connect();
    },
    cancel() {
      stopped = true;
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
      try { ws?.close(); } catch {}
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      // Removido 'connection': 'keep-alive' por incompatibilidade com HTTP/2
    },
  });
};