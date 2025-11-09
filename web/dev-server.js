/* eslint-env node */
import express from "express";
import { WebSocket } from "ws";
// Removido: import de node-fetch — não utilizado sem Roleta
import dotenv from "dotenv";

dotenv.config();

const app = express();
// Parse JSON bodies to forward to function handlers
app.use(express.json());
const PORT = process.env.DEV_SERVER_PORT || 3001;

// Configurações do WebSocket e API
const WS_URL =
  process.env.PLAYNABETS_WS_URL || "wss://play.soline.bet:5903/Game";
// Removido: configurações da Roleta — projeto focado apenas em Double

// CORS para permitir conexão do frontend local (inclui Authorization)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  // Trata preflight OPTIONS genericamente
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// Handler padrão (no-op) para daily-reset — será substituído por import dinâmico se existir
let dailyResetHandler = async () => ({
  statusCode: 404,
  body: JSON.stringify({ ok: false, error: "daily-reset not configured" }),
});

// Tentar importar dinamicamente a função Netlify (se foi removida, não quebra o dev-server)
(async () => {
  try {
    const mod = await import("./netlify/functions/daily-reset.js");
    // suportar export named 'handler' ou default
    dailyResetHandler = mod.handler || mod.default || dailyResetHandler;
    console.log("[DEV] daily-reset handler loaded from netlify/functions");
  } catch {
    console.warn("[DEV] daily-reset function not found, continuing without it");
  }
})();

// Handler para alerts (MongoDB) — carregado dinamicamente da função Netlify
let alertsHandler = async () => ({
  statusCode: 404,
  body: JSON.stringify({ ok: false, error: "alerts not configured" }),
});

(async () => {
  try {
    const mod = await import("./netlify/functions/alerts.js");
    alertsHandler = mod.handler || mod.default || alertsHandler;
    console.log("[DEV] alerts handler loaded from netlify/functions");
  } catch {
    console.warn("[DEV] alerts function not found, continuing without it");
  }
})();

// Handler para results (MongoDB) — persistir últimos resultados
let resultsHandler = async () => ({
  statusCode: 404,
  body: JSON.stringify({ ok: false, error: "results not configured" }),
});
(async () => {
  try {
    const mod = await import("./netlify/functions/results.js");
    resultsHandler = mod.handler || mod.default || resultsHandler;
    console.log("[DEV] results handler loaded from netlify/functions");
  } catch {
    console.warn("[DEV] results function not found, continuing without it");
  }
})();

// Handler para outcomes de sinais (MongoDB)
let signalsHandler = async () => ({
  statusCode: 404,
  body: JSON.stringify({ ok: false, error: "signals not configured" }),
});
(async () => {
  try {
    const mod = await import("./netlify/functions/signals.js");
    signalsHandler = mod.handler || mod.default || signalsHandler;
    console.log("[DEV] signals handler loaded from netlify/functions");
  } catch {
    console.warn("[DEV] signals function not found, continuing without it");
  }
})();

// Rota local para manual reset delegando à função Netlify (se disponível)
app.post("/api/daily-reset", async (req, res) => {
  try {
    const event = {
      httpMethod: "POST",
      headers: req.headers || {},
      body: JSON.stringify(req.body || {}),
    };
    const result = await dailyResetHandler(event);
    const status = result?.statusCode ?? (result?.ok ? 200 : 500);
    const headers = result?.headers || {};
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v !== "undefined") res.setHeader(k, v);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(status).send(result?.body ?? JSON.stringify(result ?? {}));
  } catch (e) {
    res
      .status(500)
      .json({
        ok: false,
        error: e?.message || String(e || "Erro desconhecido"),
      });
  }
});

// Rota para alerts (GET/POST) delegando à função Netlify
app.all("/api/alerts", async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const event = {
      httpMethod: req.method,
      headers: req.headers || {},
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      body: req.method === "GET" ? null : JSON.stringify(req.body || {}),
      path: req.path,
    };
    const result = await alertsHandler(event);
    const status = result?.statusCode ?? (result?.ok ? 200 : 500);
    const headers = result?.headers || {};
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v !== "undefined") res.setHeader(k, v);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(status).send(result?.body ?? JSON.stringify(result ?? {}));
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Rota para results (GET/POST) delegando à função Netlify
app.all("/api/results", async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const event = {
      httpMethod: req.method,
      headers: req.headers || {},
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      body: req.method === "GET" ? null : JSON.stringify(req.body || {}),
      path: req.path,
    };
    const result = await resultsHandler(event);
    const status = result?.statusCode ?? (result?.ok ? 200 : 500);
    const headers = result?.headers || {};
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v !== "undefined") res.setHeader(k, v);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(status).send(result?.body ?? JSON.stringify(result ?? {}));
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Rota para outcomes de sinais (GET/POST)
app.all("/api/signals", async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const event = {
      httpMethod: req.method,
      headers: req.headers || {},
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      body: req.method === "GET" ? null : JSON.stringify(req.body || {}),
      path: req.path,
    };
    const result = await signalsHandler(event);
    const status = result?.statusCode ?? (result?.ok ? 200 : 500);
    const headers = result?.headers || {};
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v !== "undefined") res.setHeader(k, v);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(status).send(result?.body ?? JSON.stringify(result ?? {}));
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

function extractJsonStr(s) {
  if (!s || typeof s !== "string") return null;
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i !== -1 && j !== -1 && j > i) {
    return s.slice(i, j + 1);
  }
  return null;
}

function normalizeResult(obj) {
  try {
    const raw = obj?.data ?? obj;
    const out = typeof raw === "object" ? { ...raw } : { raw };
    const candidates = [out.value, out.number, out.n, out.roll, out.result];
    for (const c of candidates) {
      if (c !== undefined && c !== null) {
        const num = Number(c);
        if (Number.isFinite(num)) {
          out.value = num;
          break;
        }
      }
    }
    out.round_id = out.round_id ?? out.roundId ?? out.gameId;
    const dt = out.timestamp ?? out.dateutc;
    if (dt !== undefined && dt !== null) {
      const n = Number(dt);
      if (Number.isFinite(n)) {
        out.timestamp = n > 1e12 ? n : n >= 0 ? n * 1000 : Date.now();
      }
    } else {
      out.timestamp = Date.now();
    }
    return out;
  } catch (err) {
    if (err) void err;
    // ignore parse errors and return original
    return obj;
  }
}

// Removido: normalização de resultados da Roleta

// Removido: utilitário de sessão da Roleta

// Removido: login para Roleta

// Removido: lançamento de jogo da Roleta

// Removido: histórico da Roleta

// Endpoint SSE /events
app.get("/events", (req, res) => {
  console.log("[DEV] Client connected to /events");

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  let ws;
  let heartbeat;
  let lastKey = null;
  let stopped = false;
  // Removido: estado e timers da Roleta

  const send = (event, data) => {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    res.write(`event: ${event}\ndata: ${payload}\n\n`);
  };

  const sendDefault = (data) => {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    res.write(`data: ${payload}\n\n`);
  };

  // Conexão WebSocket para Double
  send("status", {
    type: "status",
    connected: false,
    ts: Date.now(),
    source: "dev-server",
  });
  sendDefault({
    type: "status",
    connected: false,
    ts: Date.now(),
    source: "dev-server",
  });

  const connect = () => {
    try {
      ws = new WebSocket(WS_URL);
    } catch (err) {
      const errPayload = {
        type: "status",
        connected: false,
        ts: Date.now(),
        error: String(err?.message || err),
      };
      send("status", errPayload);
      sendDefault(errPayload);
      setTimeout(() => {
        if (!stopped) connect();
      }, 2000);
      return;
    }

    ws.on("open", () => {
      const okPayload = { type: "status", connected: true, ts: Date.now() };
      send("status", okPayload);
      sendDefault(okPayload);
      heartbeat = setInterval(() => {
        const pingPayload = { type: "status", connected: true, ts: Date.now() };
        send("ping", pingPayload);
        sendDefault(pingPayload);
      }, 10000);
    });

    ws.on("message", (data) => {
      let text = "";
      try {
        text = data.toString();
      } catch (e) {
        void e;
      }
      const jsonStr = extractJsonStr(text) || text;
      let payload = null;
      try {
        payload = JSON.parse(jsonStr);
      } catch (e) {
        if (e) void e;
        const nested = extractJsonStr(jsonStr);
        if (nested) {
          try {
            payload = JSON.parse(nested);
          } catch (e2) {
            void e2;
          }
        }
      }
      if (payload) {
        const normalized = normalizeResult(payload);
        // Persistir resultado no MongoDB (best-effort; não bloqueia stream)
        try {
          const ev = {
            httpMethod: "POST",
            headers: {},
            body: JSON.stringify({ kind: "double", result: normalized }),
          };
          void resultsHandler(ev);
        } catch (e) {
          // ignorar falhas de persistência
          void e;
        }
        const key = JSON.stringify(normalized).slice(0, 400);
        if (key !== lastKey) {
          lastKey = key;
          const resultPayload = { type: "double_result", data: normalized };
          send("double_result", resultPayload);
          sendDefault(resultPayload);
        }
      }
    });

    ws.on("error", (err) => {
      const errPayload = {
        type: "status",
        connected: false,
        ts: Date.now(),
        error: String(err?.message || err),
      };
      send("status", errPayload);
      sendDefault(errPayload);
    });

    ws.on("close", () => {
      const closePayload = { type: "status", connected: false, ts: Date.now() };
      send("status", closePayload);
      sendDefault(closePayload);
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (!stopped) setTimeout(connect, 2000);
    });
  };

  connect();
  // Removido: polling da Roleta

  // Limpeza quando cliente desconecta
  req.on("close", () => {
    console.log("[DEV] Client disconnected from /events");
    stopped = true;
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    try {
      ws?.close();
    } catch (e) {
      void e;
    }
    // Removido: timers da Roleta
  });
});

app.listen(PORT, () => {
  console.log(`[DEV] Server running on http://localhost:${PORT}`);
  console.log(`[DEV] SSE endpoint: http://localhost:${PORT}/events`);
});
