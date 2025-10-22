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

      // ------------------------- Roleta (Pragmatic) -------------------------
      const PRAGMATIC_BASE = context?.env?.PRAGMATIC_BASE || 'https://games.pragmaticplaylive.net';
      const PRAGMATIC_HISTORY_ENDPOINT = context?.env?.PRAGMATIC_HISTORY_ENDPOINT || '/api/ui/statisticHistory';
      let TABLE_ID = context?.env?.PRAGMATIC_TABLE_ID || context?.env?.ROULETTE_TABLE_ID || 'rwbrzportrwa16rg';
      const LOGIN_URL = context?.env?.PLAYNABETS_LOGIN_URL || 'https://loki1.weebet.tech/auth/login';
      const email = context?.env?.PLAYNABETS_USER || context?.env?.PLAYNABETS_EMAIL || '';
      const password = context?.env?.PLAYNABETS_PASS || context?.env?.PLAYNABETS_PASSWORD || '';
      let jsessionid = null;
      let rouletteTimer = null;
      let lastRouletteKey = null;
      let lastStatusKey = '';

      const emitRouletteStatus = (info) => {
        const payload = { type: 'roulette_status', ...info, ts: Date.now() };
        send('roulette_status', payload);
        sendDefault(payload);
      };

      async function performLoginViaFunction() {
        try {
          let fnUrl = null;
          try { fnUrl = new URL('/.netlify/functions/login', request.url).toString(); } catch {}
          if (!fnUrl && context?.site?.url) {
            try { fnUrl = new URL('/.netlify/functions/login', context.site.url).toString(); } catch {}
          }
          if (!fnUrl) throw new Error('cannot_build_functions_url');

          const res = await fetch(fnUrl, { method: 'POST' });
          const data = await res.json().catch(() => ({}));
          const token = data?.results?.tokenCassino || data?.tokenCassino || data?.token || null;
          emitRouletteStatus({ stage: 'login_function', ok: !!token, httpStatus: res.status || 0, url: fnUrl });
          return token;
        } catch (err) {
          emitRouletteStatus({ stage: 'login_function', ok: false, error: String(err?.message || err) });
          return null;
        }
      }

      async function performLogin() {
        try {
          if (!email || !password) { 
            emitRouletteStatus({ stage: 'login', ok: false, reason: 'missing_credentials' }); 
            // Fallback: usar Netlify Function que tem acesso às envs
            return await performLoginViaFunction(); 
          }
          const body = {
            username: email,
            password,
            googleId: '',
            googleIdToken: '',
            loginMode: 'email',
            cookie: '',
            ignorarValidacaoEmailObrigatoria: true,
            betting_shop_code: null,
          };
          const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Referer': 'https://playnabets.com/',
            'Origin': 'https://playnabets.com',
          };
          const res = await fetch(LOGIN_URL, { method: 'POST', headers, body: JSON.stringify(body) });
          const data = await res.json().catch(() => ({}));
          const token = data?.results?.tokenCassino || null;
          emitRouletteStatus({ stage: 'login', ok: !!token, httpStatus: res.status || 0 });
          return token;
        } catch (err) { 
          emitRouletteStatus({ stage: 'login', ok: false, error: String(err?.message || err) }); 
          // Fallback adicional: tentar via Function
          return await performLoginViaFunction(); 
        }
      }

      function extractJSessionIdFromSetCookie(setCookie) {
        if (!setCookie) return null;
        const cookies = Array.isArray(setCookie) ? setCookie : String(setCookie).split(/,(?=\s*[^;]+=)/);
        for (const c of cookies) {
          const m = String(c).match(/JSESSIONID=([^;]+)/i);
          if (m) return m[1];
        }
        return null;
      }

      async function launchGameAndGetSession(token) {
        if (!token) { emitRouletteStatus({ stage: 'gamelaunch', ok: false, reason: 'no_token' }); return null; }
        const url = `${PRAGMATIC_BASE}/api/secure/GameLaunch` +
          `?environmentID=31&gameid=237&secureLogin=weebet_playnabet&requestCountryCode=BR` +
          `&userEnvId=31&ppCasinoId=4697&ppGame=237&ppToken=${encodeURIComponent(token)}` +
          `&ppExtraData=eyJsYW5ndWFnZSI6InB0IiwibG9iYnlVcmwiOiJodHRwczovL3BsYXluYWJldC5jb20vY2FzaW5vIiwicmVxdWVzdENvdW50cnlDb2RlIjoiQlIifQ%3D%3D` +
          `&isGameUrlApiCalled=true&stylename=weebet_playnabet`;
        try {
          const res = await fetch(url, {
            headers: {
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Referer': 'https://playnabets.com/',
              'Authorization': `Bearer ${token}`,
            },
            // Não seguir redirects para capturar headers (Set-Cookie/Location)
            redirect: 'manual'
          });

          const setCookie = res.headers.get('set-cookie') || '';
          // Também tentar extrair do Location (com JSESSIONID na URL)
          const location = res.headers.get('location') || res.headers.get('Location') || '';
          let sid = extractJSessionIdFromSetCookie(setCookie);
          if (!sid && location) {
            try {
              const u = new URL(location, PRAGMATIC_BASE);
              const qs = new URLSearchParams(u.search || '');
              sid = qs.get('JSESSIONID') || sid;
            } catch {}
          }

          emitRouletteStatus({ stage: 'gamelaunch', ok: !!sid, httpStatus: res.status || 0, hasSetCookie: !!setCookie });
          return sid;
        } catch (err) { emitRouletteStatus({ stage: 'gamelaunch', ok: false, error: String(err?.message || err) }); return null; }
      }

      async function ensureRouletteSession() {
        if (jsessionid) return true;
        const token = await performLogin();
        if (!token) return false;
        const sid = await launchGameAndGetSession(token);
        if (sid) { jsessionid = sid; return true; }
        return false;
      }

      function normalizeRoulette(item) {
        try {
          const out = { ...item };
          const numCandidates = [out.number, out.value, out.n];
          let num = null;
          for (const c of numCandidates) {
            const n = Number(c);
            if (Number.isFinite(n)) { num = n; break; }
          }
          if (num == null && typeof out.gameResult === 'string') {
            const m = out.gameResult.match(/\d+/);
            if (m) num = Number(m[0]);
          }
          let color = out.color;
          if (!color && typeof out.gameResult === 'string') {
            if (/red/i.test(out.gameResult)) color = 'red';
            else if (/black/i.test(out.gameResult)) color = 'black';
            else if (/green|\b0\b/i.test(out.gameResult)) color = 'green';
          }
          if (num === 0) color = 'green';
          out.number = num;
          out.color = color || (num === 0 ? 'green' : out.color || 'black');
          out.timestamp = out.timestamp || out.ts || Date.now();
          return out;
        } catch { return item; }
      }

      async function fetchRouletteHistory(numberOfGames = 5) {
        if (!jsessionid) return null;
        const url = `${PRAGMATIC_BASE}${PRAGMATIC_HISTORY_ENDPOINT}` +
          `?tableId=${encodeURIComponent(TABLE_ID)}` +
          `&numberOfGames=${numberOfGames}` +
          `&JSESSIONID=${encodeURIComponent(jsessionid)}` +
          `&ck=${Date.now()}` +
          `&game_mode=lobby_desktop`;
        try {
          const res = await fetch(url, {
            headers: {
              'Accept': 'application/json, text/plain, */*',
              'Referer': 'https://client.pragmaticplaylive.net/',
              'Origin': 'https://client.pragmaticplaylive.net',
              'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
              'Cookie': `JSESSIONID=${jsessionid}`,
            },
          });
          if (res.status === 401 || res.status === 403) { emitRouletteStatus({ stage: 'history', ok: false, httpStatus: res.status }); jsessionid = null; return null; }
          const data = await res.json().catch(() => ({}));
          const hist = Array.isArray(data?.history) ? data.history : [];
          if (!hist.length) emitRouletteStatus({ stage: 'history', ok: true, size: 0 });
          return hist;
        } catch (err) { emitRouletteStatus({ stage: 'history', ok: false, error: String(err?.message || err) }); return null; }
      }

      async function rouletteTick() {
        if (stopped) return;
        const ok = await ensureRouletteSession();
        if (!ok) {
          const key = 'no_session';
          if (lastStatusKey !== key) { emitRouletteStatus({ stage: 'tick', ok: false, reason: key }); lastStatusKey = key; }
          rouletteTimer = setTimeout(rouletteTick, 5000);
          return;
        }
        const hist = await fetchRouletteHistory(3);
        if (Array.isArray(hist) && hist.length) {
          const item = hist[0];
          const normalized = normalizeRoulette(item);
          if (typeof normalized.number !== 'undefined') {
            const key = `${normalized.number}-${normalized.color}`;
            if (key !== lastRouletteKey) {
              lastRouletteKey = key;
              const payload = { type: 'roulette_result', data: normalized };
              send('roulette_result', payload);
              sendDefault(payload);
              lastStatusKey = 'emitting';
            }
          }
        } else {
          const key = 'empty_history';
          if (lastStatusKey !== key) { emitRouletteStatus({ stage: 'tick', ok: true, reason: key }); lastStatusKey = key; }
        }
        rouletteTimer = setTimeout(rouletteTick, 2000);
      }

      rouletteTick();
    },
    cancel() {
      stopped = true;
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
      try { ws?.close(); } catch {}
      // Encerrar polling de roleta
      if (rouletteTimer) { clearTimeout(rouletteTimer); rouletteTimer = null; }
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