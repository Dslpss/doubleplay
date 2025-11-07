const SERVER_URL = import.meta.env.VITE_SERVER_URL || null;
const apiUrls = (endpoint) =>
  SERVER_URL
    ? [`${SERVER_URL}/api/${endpoint}`, `/.netlify/functions/${endpoint}`]
    : [`/.netlify/functions/${endpoint}`];

async function fetchWithFallback(endpoint, init) {
  const [primary, fallback] = apiUrls(endpoint);
  try {
    const res = await fetch(primary, init);
    if (res.ok) return res;
    // tenta fallback quando status não ok
    const res2 = await fetch(fallback, init);
    return res2;
  } catch {
    // tenta fallback quando erro de rede
    try {
      return await fetch(fallback, init);
    } catch {
      throw new Error("Falha nas chamadas primária e fallback");
    }
  }
}

export async function login(email, password) {
  try {
    const res = await fetchWithFallback("login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  } catch {
    return { ok: false, error: "Login indisponível" };
  }
}

export async function status() {
  try {
    const res = await fetchWithFallback("status");
    return res.json();
  } catch {
    return { ok: true, wsConnected: true, hasToken: false };
  }
}

export async function connectWsBridge() {
  try {
    const res = await fetchWithFallback("connect", { method: "POST" });
    return res.json();
  } catch (e) {
    console.error("Erro em connectWsBridge:", e);
    return { ok: false, error: "Conexão WS não disponível" };
  }
}

export async function autoBet(color, amount = 1) {
  try {
    const res = await fetchWithFallback("auto-bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color, amount }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Falha ao acionar auto-aposta");
    }
    return res.json();
  } catch (e) {
    return { ok: false, error: e.message || "Auto-aposta indisponível" };
  }
}

export async function manualReset(user, pass) {
  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${user}:${pass}`)}`,
    };
    const res = await fetchWithFallback("daily-reset", {
      method: "POST",
      headers,
      body: JSON.stringify({ user, pass, manual: true }),
    });
    const data = await res.json().catch(() => ({ ok: false }));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Falha ao executar reset");
    }
    return data;
  } catch (e) {
    return { ok: false, error: e.message || "Reset indisponível" };
  }
}
