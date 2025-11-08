/* eslint-env node */
import express from "express";
import { WebSocket } from "ws";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
// Parse JSON bodies to forward to function handlers
app.use(express.json());
const PORT = process.env.DEV_SERVER_PORT || 3001;

// Configurações do WebSocket e API
const WS_URL =
  process.env.PLAYNABETS_WS_URL || "wss://play.soline.bet:5903/Game";
const PRAGMATIC_BASE =
  process.env.PRAGMATIC_BASE || "https://games.pragmaticplaylive.net";
const PRAGMATIC_HISTORY_ENDPOINT =
  process.env.PRAGMATIC_HISTORY_ENDPOINT || "/api/ui/statisticHistory";
const TABLE_ID =
  process.env.PRAGMATIC_TABLE_ID ||
  process.env.ROULETTE_TABLE_ID ||
  "rwbrzportrwa16rg";
const LOGIN_URL =
  process.env.PLAYNABETS_LOGIN_URL || "https://loki1.weebet.tech/auth/login";
const email = process.env.PLAYNABETS_USER || process.env.PLAYNABETS_EMAIL || "";
const password =
  process.env.PLAYNABETS_PASS || process.env.PLAYNABETS_PASSWORD || "";
const MOCK_ROULETTE = String(process.env.MOCK_ROULETTE || "").trim() === "1";

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

function normalizeRoulette(item) {
  try {
    const out = { ...item };
    const numCandidates = [out.number, out.value, out.n];
    let num = null;
    for (const c of numCandidates) {
      const n = Number(c);
      if (Number.isFinite(n)) {
        num = n;
        break;
      }
    }
    if (num == null && typeof out.gameResult === "string") {
      const m = out.gameResult.match(/\d+/);
      if (m) num = Number(m[0]);
    }
    let color = out.color;
    if (!color && typeof out.gameResult === "string") {
      if (/red/i.test(out.gameResult)) color = "red";
      else if (/black/i.test(out.gameResult)) color = "black";
      else if (/green|\b0\b/i.test(out.gameResult)) color = "green";
    }
    if (num === 0) color = "green";
    out.number = num;
    out.color = color || (num === 0 ? "green" : out.color || "black");
    out.timestamp = out.timestamp || out.ts || Date.now();
    return out;
  } catch (err) {
    if (err) void err;
    // ignore normalization errors and return original
    return item;
  }
}

function extractJSessionIdFromSetCookie(setCookie) {
  if (!setCookie) return null;
  const cookies = Array.isArray(setCookie)
    ? setCookie
    : String(setCookie).split(/,(?=\s*[^;]+=)/);
  for (const c of cookies) {
    const m = String(c).match(/JSESSIONID=([^;]+)/i);
    if (m) return m[1];
  }
  return null;
}

async function performLogin() {
  try {
    if (!email || !password) {
      console.error("[DEV] Missing credentials");
      return null;
    }
    const body = {
      username: email,
      password,
      googleId: "",
      googleIdToken: "",
      loginMode: "email",
      cookie: "",
      ignorarValidacaoEmailObrigatoria: true,
      betting_shop_code: null,
    };
    const headers = {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Referer: "https://playnabets.com/",
      Origin: "https://playnabets.com",
    };
    const res = await fetch(LOGIN_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    const token = data?.results?.tokenCassino || null;
    console.log("[DEV] Login:", token ? "OK" : "Failed");
    return token;
  } catch (err) {
    console.error("[DEV] Login error:", err?.message || err);
    return null;
  }
}

async function launchGameAndGetSession(token) {
  if (!token) return null;
  const url =
    `${PRAGMATIC_BASE}/api/secure/GameLaunch` +
    `?environmentID=31&gameid=237&secureLogin=weebet_playnabet&requestCountryCode=BR` +
    `&userEnvId=31&ppCasinoId=4697&ppGame=237&ppToken=${encodeURIComponent(
      token
    )}` +
    `&ppExtraData=eyJsYW5ndWFnZSI6InB0IiwibG9iYnlVcmwiOiJodHRwczovL3BsYXluYWJldC5jb20vY2FzaW5vIiwicmVxdWVzdENvdW50cnlDb2RlIjoiQlIifQ%3D%3D` +
    `&isGameUrlApiCalled=true&stylename=weebet_playnabet`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: "https://playnabets.com/",
        Authorization: `Bearer ${token}`,
      },
      redirect: "manual",
    });

    const setCookie = res.headers.get("set-cookie") || "";
    const location =
      res.headers.get("location") || res.headers.get("Location") || "";
    let sid = extractJSessionIdFromSetCookie(setCookie);
    if (!sid && location) {
      try {
        const u = new URL(location, PRAGMATIC_BASE);
        const qs = new URLSearchParams(u.search || "");
        sid = qs.get("JSESSIONID") || sid;
      } catch (e) {
        if (e) void e;
      }
    }

    console.log("[DEV] Game launch:", sid ? "OK" : "Failed");
    return sid;
  } catch (err) {
    console.error("[DEV] Game launch error:", err?.message || err);
    return null;
  }
}

async function fetchRouletteHistory(jsessionid, numberOfGames = 5) {
  if (!jsessionid) return null;
  const url =
    `${PRAGMATIC_BASE}${PRAGMATIC_HISTORY_ENDPOINT}` +
    `?tableId=${encodeURIComponent(TABLE_ID)}` +
    `&numberOfGames=${numberOfGames}` +
    `&JSESSIONID=${encodeURIComponent(jsessionid)}` +
    `&ck=${Date.now()}` +
    `&game_mode=lobby_desktop`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: "https://client.pragmaticplaylive.net/",
        Origin: "https://client.pragmaticplaylive.net",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        Cookie: `JSESSIONID=${jsessionid}`,
      },
    });
    if (res.status === 401 || res.status === 403) {
      console.log("[DEV] Session expired");
      return null;
    }
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.history) ? data.history : [];
  } catch (err) {
    console.error("[DEV] History error:", err?.message || err);
    return null;
  }
}

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
  let jsessionid = null;
  let mockMode = MOCK_ROULETTE; // habilita mock se definido via env
  let rouletteTimer = null;
  let lastRouletteKey = null;

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

  // Polling da roleta
  async function ensureRouletteSession() {
    if (mockMode) return false;
    if (jsessionid) return true;
    const haveCreds = !!(email && password);
    if (!haveCreds) {
      console.warn("[DEV] Missing credentials, enabling MOCK roulette mode");
      mockMode = true;
      return false;
    }
    const token = await performLogin();
    if (!token) {
      console.warn("[DEV] Login failed, enabling MOCK roulette mode");
      mockMode = true;
      return false;
    }
    const sid = await launchGameAndGetSession(token);
    if (sid) {
      jsessionid = sid;
      return true;
    }
    console.warn("[DEV] Could not obtain session, enabling MOCK roulette mode");
    mockMode = true;
    return false;
  }

  async function rouletteTick() {
    if (stopped) return;
    if (mockMode) {
      // Geração de resultado mock a cada 2s
      const num = Math.floor(Math.random() * 37); // 0..36
      let color = "black";
      if (num === 0) color = "green";
      else if (num % 2 === 1) color = "red";
      const normalized = { number: num, color, timestamp: Date.now() };
      const key = `${normalized.number}-${normalized.color}`;
      if (key !== lastRouletteKey) {
        lastRouletteKey = key;
        const payload = { type: "roulette_result", data: normalized };
        send("roulette_result", payload);
        sendDefault(payload);
      }
      rouletteTimer = setTimeout(rouletteTick, 2000);
      return;
    }

    const ok = await ensureRouletteSession();
    if (!ok) {
      rouletteTimer = setTimeout(rouletteTick, 2000);
      return;
    }
    const hist = await fetchRouletteHistory(jsessionid, 3);
    if (Array.isArray(hist) && hist.length) {
      const item = hist[0];
      const normalized = normalizeRoulette(item);
      if (typeof normalized.number !== "undefined") {
        const key = `${normalized.number}-${normalized.color}`;
        if (key !== lastRouletteKey) {
          lastRouletteKey = key;
          const payload = { type: "roulette_result", data: normalized };
          send("roulette_result", payload);
          sendDefault(payload);
        }
      }
    }
    rouletteTimer = setTimeout(rouletteTick, 2000);
  }

  rouletteTick();

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
    if (rouletteTimer) {
      clearTimeout(rouletteTimer);
      rouletteTimer = null;
    }
  });
});

app.listen(PORT, () => {
  console.log(`[DEV] Server running on http://localhost:${PORT}`);
  console.log(`[DEV] SSE endpoint: http://localhost:${PORT}/events`);
});
