const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const SERVER_URL = import.meta.env.VITE_SERVER_URL || (isLocalhost ? 'http://localhost:4000' : null);
const apiUrl = (endpoint) => SERVER_URL ? `${SERVER_URL}/api/${endpoint}` : `/.netlify/functions/${endpoint}`;

export async function login(email, password) {
  try {
    const res = await fetch(apiUrl('login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  } catch {
    return { ok: false, error: 'Login indisponível' };
  }
}

export async function status() {
  try {
    const res = await fetch(apiUrl('status'));
    return res.json();
  } catch {
    return { ok: true, wsConnected: false, hasToken: false };
  }
}

export async function connectWsBridge() {
  try {
    const res = await fetch(apiUrl('connect'), { method: 'POST' });
    return res.json();
  } catch (e) {
    return { ok: false, error: 'Conexão WS não disponível' };
  }
}

export async function autoBet(color, amount = 1) {
  try {
    const res = await fetch(apiUrl('auto-bet'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color, amount }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao acionar auto-aposta');
    }
    return res.json();
  } catch (e) {
    return { ok: false, error: e.message || 'Auto-aposta indisponível' };
  }
}