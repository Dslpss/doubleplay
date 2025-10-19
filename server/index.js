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
  });
});

app.post('/api/connect', (req, res) => {
  connectPlayWs();
  res.json({ ok: true, message: 'Tentando conectar ao WebSocket PlayNaBets' });
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