import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import axios from 'axios';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

const app = express();
app.use(express.json());
app.use(cors({ origin: '*'}));
app.use(morgan('dev'));

const PORT = process.env.PORT || 4000;
const LOGIN_URL = process.env.PLAYNABETS_LOGIN_URL || 'https://loki1.weebet.tech/auth/login';
const WS_URL = process.env.PLAYNABETS_WS_URL || process.env.PLAYNABETS_WS || 'wss://play.soline.bet:5903/Game';
// Pragmatic (Roleta)
const PRAGMATIC_BASE = process.env.PRAGMATIC_BASE || 'https://games.pragmaticplaylive.net';
const PRAGMATIC_HISTORY_ENDPOINT = process.env.PRAGMATIC_HISTORY_ENDPOINT || '/api/ui/statisticHistory';
let ROULETTE_TABLE_ID = process.env.PRAGMATIC_TABLE_ID || process.env.ROULETTE_TABLE_ID || '';
if (!ROULETTE_TABLE_ID || /id_da_mesa/i.test(ROULETTE_TABLE_ID)) {
  ROULETTE_TABLE_ID = 'rwbrzportrwa16rg';
}

// In-memory state
let auth = {
  email: process.env.PLAYNABETS_USER || process.env.PLAYNABETS_EMAIL || '',
  password: process.env.PLAYNABETS_PASS || process.env.PLAYNABETS_PASSWORD || '',
  token: null,
};

let playWs = null;
let reconnectTimer = null;
const clients = new Set();
let lastPayload = null;

// SSE clients
const sseClients = new Set();

// Janela deslizante de apostas recentes
const BET_WINDOW_SIZE = 200;
const recentBets = [];

// --- Estado da Roleta (Pragmatic) ---
const rouletteState = {
  jsessionid: null,
  monitoring: false,
  intervalId: null,
  lastResultKey: null,
  recentResults: [],
};

function rouletteColorFromNumber(n) {
  if (n === 0) return 'green';
  const reds = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  return reds.has(Number(n)) ? 'red' : 'black';
}

function extractJSessionIdFromHeaders(headers = {}) {
  try {
    const setCookie = headers['set-cookie'];
    if (setCookie && Array.isArray(setCookie)) {
      for (const c of setCookie) {
        const m = /JSESSIONID=([^;]+)/.exec(c);
        if (m) return m[1];
      }
    } else if (typeof setCookie === 'string') {
      const m = /JSESSIONID=([^;]+)/.exec(setCookie);
      if (m) return m[1];
    }
    const loc = headers['location'] || headers['Location'];
    if (loc) {
      const m = /JSESSIONID=([^&]+)/.exec(loc);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

async function performLogin(email, password) {
  try {
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
    const { data, status } = await axios.post(LOGIN_URL, body, { headers, timeout: 15000 });
    if (status === 200 && data?.success) {
      auth.token = data.results?.tokenCassino || null;
      auth.email = email;
      auth.password = password;
      return { ok: true, data: { token: auth.token } };
    }
    return { ok: false, error: data?.message || 'Falha no login' };
  } catch (e) {
    return { ok: false, error: e.message || 'Erro no login' };
  }
}

async function launchGameAndGetSession() {
  if (!auth.token) return null;
  const url = `${PRAGMATIC_BASE}/api/secure/GameLaunch` +
    `?environmentID=31&gameid=237&secureLogin=weebet_playnabet&requestCountryCode=BR` +
    `&userEnvId=31&ppCasinoId=4697&ppGame=237&ppToken=${encodeURIComponent(auth.token)}` +
    `&ppExtraData=eyJsYW5ndWFnZSI6InB0IiwibG9iYnlVcmwiOiJodHRwczovL3BsYXluYWJldC5jb20vY2FzaW5vIiwicmVxdWVzdENvdW50cnlDb2RlIjoiQlIifQ%3D%3D` +
    `&isGameUrlApiCalled=true&stylename=weebet_playnabet`;
  try {
    const res = await axios.get(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://playnabets.com/',
        'Authorization': `Bearer ${auth.token}`,
      },
      timeout: 20000,
      maxRedirects: 0,
      validateStatus: () => true,
    });
    if (res.status >= 400 && res.status !== 302) {
      return null;
    }
    return extractJSessionIdFromHeaders(res.headers);
  } catch (e) {
    return null;
  }
}

async function ensureRouletteSession() {
  if (rouletteState.jsessionid) return true;
  if (!auth.token && (auth.email && auth.password)) {
    const r = await performLogin(auth.email, auth.password);
    if (!r.ok) return false;
  }
  const sid = await launchGameAndGetSession();
  if (sid) {
    rouletteState.jsessionid = sid;
    return true;
  }
  return false;
}

async function fetchRouletteHistory(numberOfGames = 20) {
  if (!rouletteState.jsessionid) return { ok: false, error: 'Sem JSESSIONID' };
  const url = `${PRAGMATIC_BASE}${PRAGMATIC_HISTORY_ENDPOINT}` +
    `?tableId=${encodeURIComponent(ROULETTE_TABLE_ID)}` +
    `&numberOfGames=${numberOfGames}` +
    `&JSESSIONID=${encodeURIComponent(rouletteState.jsessionid)}` +
    `&ck=${Date.now()}` +
    `&game_mode=lobby_desktop`;
  try {
    const res = await axios.get(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://client.pragmaticplaylive.net/',
        'Origin': 'https://client.pragmaticplaylive.net',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Cookie': `JSESSIONID=${rouletteState.jsessionid}`,
      },
      timeout: 10000,
      validateStatus: () => true,
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'Unauthorized', status: res.status };
    }
    const data = res.data || {};
    if ((data.errorCode === '0' || data.errorCode === 0) && Array.isArray(data.history)) {
      // Normalizar minimamente
      const normalized = data.history.map((item) => {
        // Extrair número do gameResult (ex: "18 Red" -> 18)
        let number = Number(item.number ?? item.resultNumber ?? item.value ?? 0);
        if (number === 0 && item.gameResult) {
          const match = item.gameResult.match(/^(\d+)/);
          if (match) {
            number = Number(match[1]);
          }
        }
        
        // Extrair cor do gameResult ou calcular baseado no número
        let color = item.color;
        if (!color && item.gameResult) {
          const gameResult = item.gameResult.toLowerCase();
          if (gameResult.includes('red')) color = 'red';
          else if (gameResult.includes('black')) color = 'black';
          else if (gameResult.includes('green')) color = 'green';
        }
        if (!color) {
          color = rouletteColorFromNumber(number);
        }
        
        const timestamp = item.timestamp || item.time || Date.now();
        const id = item.id || `${timestamp}_${number}`;
        return { id, number, color, timestamp, raw: item };
      });
      return { ok: true, results: normalized };
    }
    return { ok: false, error: data.description || 'Resposta inválida', data };
  } catch (e) {
    return { ok: false, error: e.message || 'Erro ao buscar histórico' };
  }
}

// (removido: versões antigas de broadcast/broadcastSse/getBetsSummary substituídas por implementações abaixo)

async function rouletteTick() {
  try {
    // Garantir sessão
    const ok = await ensureRouletteSession();
    if (!ok) return;

    const r = await fetchRouletteHistory(1);
    if (!r.ok || !Array.isArray(r.results) || r.results.length === 0) {
      if (r.status === 401 || /Unauthorized/i.test(r.error || '')) {
        rouletteState.jsessionid = null; // força renovação
      }
      return;
    }
    const newest = r.results[0];
    const key = `${newest.id || ''}|${newest.timestamp || ''}|${newest.number}`;
    if (key !== rouletteState.lastResultKey) {
      rouletteState.lastResultKey = key;
      rouletteState.recentResults.unshift(newest);
      rouletteState.recentResults = rouletteState.recentResults.slice(0, 200);
      const evt = { type: 'roulette_result', data: newest };
      broadcast(evt);
      broadcastSse(evt);
    }
  } catch {}
}

function startRouletteMonitor(intervalMs = 2000) {
  if (rouletteState.monitoring) return true;
  rouletteState.monitoring = true;
  rouletteState.intervalId = setInterval(rouletteTick, Math.max(1000, Number(intervalMs) || 2000));
  return true;
}

function stopRouletteMonitor() {
  if (rouletteState.intervalId) clearInterval(rouletteState.intervalId);
  rouletteState.intervalId = null;
  rouletteState.monitoring = false;
}

function isBetEvent(obj) {
  try {
    const t = String(obj?.type || '').toLowerCase();
    if (t.includes('bet') || t.includes('aposta') || t.includes('placebet') || t.includes('wager') || t.includes('stake')) return true;
    const data = obj?.data || obj;
    if (data && (Object.prototype.hasOwnProperty.call(data, 'bet') || Object.prototype.hasOwnProperty.call(data, 'aposta'))) return true;
    if (typeof data?.action === 'string' && data.action.toLowerCase().includes('bet')) return true;
    return false;
  } catch { return false; }
}

function detectBetColor(obj) {
  const data = obj?.data || obj;
  const candidates = [data?.color, data?.betColor, data?.selection, data?.side, data?.bet?.color, data?.aposta?.cor];
  for (const c of candidates) {
    if (typeof c === 'string') {
      const s = c.toLowerCase();
      if (s.includes('red') || s.includes('vermelho')) return 'red';
      if (s.includes('black') || s.includes('preto')) return 'black';
      if (s.includes('white') || s.includes('branco')) return 'white';
    }
  }
  const text = JSON.stringify(obj).toLowerCase();
  if (text.includes('vermelho') || text.includes('red')) return 'red';
  if (text.includes('preto') || text.includes('black')) return 'black';
  if (text.includes('branco') || text.includes('white')) return 'white';
  return null;
}

function pushBetColor(color) {
  if (!color || !['red','black','white'].includes(color)) return;
  recentBets.push(color);
  if (recentBets.length > BET_WINDOW_SIZE) recentBets.shift();
}

function getBetsSummary() {
  const summary = { total: 0, red: 0, black: 0, white: 0, sampled: recentBets.length };
  for (const c of recentBets) {
    summary[c]++;
    summary.total++;
  }
  const pct = (n) => (summary.total ? Math.round((n / summary.total) * 100) : 0);
  summary.pct = { red: pct(summary.red), black: pct(summary.black), white: pct(summary.white) };
  return summary;
}

function extractJsonStr(s) {
  if (!s || typeof s !== 'string') return null;
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i !== -1 && j !== -1 && j > i) {
    return s.slice(i, j + 1);
  }
  return null;
}

function broadcast(obj) {
  const msg = typeof obj === 'string' ? obj : JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function broadcastSse(obj) {
  const msg = typeof obj === 'string' ? obj : JSON.stringify(obj);
  const type = (typeof obj === 'object' && obj?.type) ? obj.type : 'message';
  for (const res of sseClients) {
    try {
      res.write(`event: ${type}\n`);
      res.write(`data: ${msg}\n\n`);
    } catch {}
  }
}

app.post('/api/login', async (req, res) => {
  const email = req.body?.email || auth.email;
  const password = req.body?.password || auth.password;
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Credenciais não fornecidas' });
  }
  const result = await performLogin(email, password);
  if (result.ok) {
    return res.json({ ok: true, data: result.data });
  }
  return res.status(401).json(result);
});

// --- Roleta: endpoints ---
app.post('/api/roulette/start', async (req, res) => {
  const intervalMs = Number(req.body?.intervalMs || 2000);
  const ok = await ensureRouletteSession();
  if (!ok) return res.status(401).json({ ok: false, error: 'Falha ao obter sessão/JSESSIONID' });
  startRouletteMonitor(intervalMs);
  res.json({ ok: true, monitoring: true, intervalMs });
});

app.post('/api/roulette/stop', (req, res) => {
  stopRouletteMonitor();
  res.json({ ok: true, monitoring: false });
});

app.get('/api/roulette/status', (req, res) => {
  res.json({
    ok: true,
    monitoring: rouletteState.monitoring,
    hasSession: Boolean(rouletteState.jsessionid),
    lastResult: rouletteState.recentResults[0] || null,
    count: rouletteState.recentResults.length,
  });
});

app.get('/api/roulette/results', async (req, res) => {
  const limit = Math.min(200, Number(req.query?.limit || 50));
  res.json({ ok: true, results: rouletteState.recentResults.slice(0, limit) });
});

app.get('/api/roulette/history', async (req, res) => {
  const count = Math.min(500, Math.max(1, Number(req.query?.count || 50)));
  const r = await fetchRouletteHistory(count);
  if (r.ok) return res.json(r);
  const status = r.status && Number(r.status) >= 400 ? Number(r.status) : 500;
  return res.status(status).json(r);
});
app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    wsConnected: playWs?.readyState === WebSocket.OPEN,
    hasToken: Boolean(auth.token),
    lastPayload,
    betsPopularity: getBetsSummary(),
    roulette: {
      monitoring: rouletteState.monitoring,
      hasSession: Boolean(rouletteState.jsessionid),
      lastResult: rouletteState.recentResults[0] || null,
    }
  });
});

app.get('/api/bets', (req, res) => {
  res.json({ ok: true, data: getBetsSummary() });
});

function connectPlayWs() {
  if (playWs && playWs.readyState === WebSocket.OPEN) return;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  try {
    playWs = new WebSocket(WS_URL, {
      origin: 'https://soline.bet',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://soline.bet/',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
  } catch (e) {
    console.error('[PlayNaBets WS] Falha ao criar conexão:', e.message);
    return;
  }

  playWs.on('open', () => {
    console.log('[PlayNaBets WS] Conectado');
    const payload = { type: 'status', connected: true };
    broadcast(payload);
    broadcastSse(payload);
  });

  playWs.on('message', (data) => {
    let text = '';
    try {
      text = typeof data === 'string' ? data : data.toString('utf8');
    } catch (e) {
      return;
    }

    const jsonStr = extractJsonStr(text) || text;
    let payload = null;
    try {
      payload = JSON.parse(jsonStr);
    } catch (e) {
      const nested = extractJsonStr(jsonStr);
      if (nested) {
        try { payload = JSON.parse(nested); } catch {}
      }
    }

    if (payload) {
      lastPayload = payload;
      const ev = { type: 'double_result', data: payload };
      broadcast(ev);
      broadcastSse(ev);
      if (isBetEvent(payload)) {
        const color = detectBetColor(payload);
        if (color) {
          pushBetColor(color);
          const bp = { type: 'bets_popularity', data: getBetsSummary() };
          broadcast(bp);
          broadcastSse(bp);
        }
      }
    }
  });

  playWs.on('error', (err) => {
    console.error('[PlayNaBets WS] Erro:', err.message);
  });

  playWs.on('close', () => {
    console.warn('[PlayNaBets WS] Desconectado, tentando reconectar em 3s...');
    const payload = { type: 'status', connected: false };
    broadcast(payload);
    broadcastSse(payload);
    reconnectTimer = setTimeout(connectPlayWs, 3000);
  });
}

app.post('/api/connect', (req, res) => {
  connectPlayWs();
  res.json({ ok: true, message: 'Tentando conectar ao WebSocket PlayNaBets' });
});

// Recebe intenção de auto-aposta (stub) e emite broadcast
app.post('/api/auto-bet', (req, res) => {
  const color = String(req.body?.color || '').toLowerCase();
  const amount = Number(req.body?.amount || 1);
  if (!['red','black','white'].includes(color)) {
    return res.status(400).json({ ok: false, error: 'Cor inválida' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'Valor inválido' });
  }
  const payload = { type: 'auto_bet', data: { color, amount, time: Date.now() } };
  console.log('[AutoBet] Intent:', payload);
  broadcast(payload);
  broadcastSse(payload);
  res.json({ ok: true, data: payload.data });
});

// SSE endpoint
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();
  sseClients.add(res);
  console.log('[SSE] Cliente conectado, ativos:', sseClients.size);
  // Mensagem inicial
  try {
    res.write('event: hello\n');
    res.write('data: {"message":"Conexão SSE estabelecida"}\n\n');
    if (lastPayload) {
      const ev = JSON.stringify({ type: 'double_result', data: lastPayload });
      res.write('event: double_result\n');
      res.write(`data: ${ev}\n\n`);
    }
    if (rouletteState.recentResults[0]) {
      const re = JSON.stringify({ type: 'roulette_result', data: rouletteState.recentResults[0] });
      res.write('event: roulette_result\n');
      res.write(`data: ${re}\n\n`);
    }
  } catch {}

  req.on('close', () => {
    sseClients.delete(res);
    console.log('[SSE] Cliente desconectado, ativos:', sseClients.size);
  });
});

// WebSocket server para clientes
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  clients.add(socket);
  console.log('[Client WS] Conectado, clientes ativos:', clients.size);
  socket.send(JSON.stringify({ type: 'hello', message: 'Conexão estabelecida' }));

  if (lastPayload) {
    socket.send(JSON.stringify({ type: 'double_result', data: lastPayload }));
  }
  if (rouletteState.recentResults[0]) {
    socket.send(JSON.stringify({ type: 'roulette_result', data: rouletteState.recentResults[0] }));
  }

  socket.on('close', () => {
    clients.delete(socket);
    console.log('[Client WS] Desconectado, clientes ativos:', clients.size);
  });
});

server.listen(PORT, () => {
  console.log(`[Server] Rodando em http://localhost:${PORT}`);
});