import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import axios from 'axios';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
app.use(express.json());
app.use(cors({ origin: '*'}));
app.use(morgan('dev'));

const PORT = process.env.PORT || 4000;
const LOGIN_URL = process.env.PLAYNABETS_LOGIN_URL || 'https://loki1.weebet.tech/auth/login';
const WS_URL = process.env.PLAYNABETS_WS_URL || 'wss://play.soline.bet:5903/Game';

// In-memory state
let auth = {
  email: process.env.PLAYNABETS_USER || '',
  password: process.env.PLAYNABETS_PASS || '',
  token: null,
};

let playWs = null;
let reconnectTimer = null;
const clients = new Set();
let lastPayload = null;

// Janela deslizante de apostas recentes
const BET_WINDOW_SIZE = 200;
const recentBets = [];

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

async function performLogin(email, password) {
  try {
    const { data } = await axios.post(LOGIN_URL, { email, password }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    auth.token = data?.token || data?.access_token || null;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err?.response?.data || err?.message };
  }
}

function connectPlayWs() {
  if (playWs && playWs.readyState === WebSocket.OPEN) return;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  playWs = new WebSocket(WS_URL, {
    origin: 'https://soline.bet',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      'Referer': 'https://soline.bet/',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  playWs.on('open', () => {
    console.log('[PlayNaBets WS] Conectado');
    broadcast({ type: 'status', connected: true });
  });

  playWs.on('message', (data) => {
    let text = '';
    try {
      text = typeof data === 'string' ? data : data.toString('utf8');
    } catch (e) {
      return;
    }

    // Tenta extrair JSON do texto bruto
    const jsonStr = extractJsonStr(text) || text;
    let payload = null;
    try {
      payload = JSON.parse(jsonStr);
    } catch (e) {
      // pode ser string com JSON aninhado
      const nested = extractJsonStr(jsonStr);
      if (nested) {
        try { payload = JSON.parse(nested); } catch {}
      }
    }

    if (payload) {
      lastPayload = payload;
      broadcast({ type: 'double_result', data: payload });
      // Tenta capturar apostas de usuários
      if (isBetEvent(payload)) {
        const color = detectBetColor(payload);
        if (color) {
          pushBetColor(color);
          broadcast({ type: 'bets_popularity', data: getBetsSummary() });
        }
      }
    }
  });

  playWs.on('error', (err) => {
    console.error('[PlayNaBets WS] Erro:', err.message);
  });

  playWs.on('close', () => {
    console.warn('[PlayNaBets WS] Desconectado, tentando reconectar em 3s...');
    broadcast({ type: 'status', connected: false });
    reconnectTimer = setTimeout(connectPlayWs, 3000);
  });
}

// HTTP endpoints
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

app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    wsConnected: playWs?.readyState === WebSocket.OPEN,
    hasToken: Boolean(auth.token),
    lastPayload,
    betsPopularity: getBetsSummary(),
  });
});

app.get('/api/bets', (req, res) => {
  res.json({ ok: true, data: getBetsSummary() });
});

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
  res.json({ ok: true, data: payload.data });
});

// WebSocket server para clientes
import http from 'http';
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  clients.add(socket);
  console.log('[Client WS] Conectado, clientes ativos:', clients.size);
  socket.send(JSON.stringify({ type: 'hello', message: 'Conexão estabelecida' }));

  if (lastPayload) {
    socket.send(JSON.stringify({ type: 'double_result', data: lastPayload }));
  }

  socket.on('close', () => {
    clients.delete(socket);
    console.log('[Client WS] Desconectado, clientes ativos:', clients.size);
  });
});

server.listen(PORT, () => {
  console.log(`[Server] Rodando em http://localhost:${PORT}`);
});