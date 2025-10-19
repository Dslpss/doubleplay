const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const SERVER_URL = import.meta.env.VITE_SERVER_URL || (isLocalhost ? 'http://localhost:4000' : null);

export async function login(email, password) {
  const res = await fetch(`${SERVER_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function status() {
  if (!SERVER_URL) return { ok: true, wsConnected: false, hasToken: false };
  try {
    const res = await fetch(`${SERVER_URL}/api/status`);
    return res.json();
  } catch {
    return { ok: true, wsConnected: false, hasToken: false };
  }
}

export async function connectWsBridge() {
  if (!SERVER_URL) return { ok: false, message: 'Backend não configurado' };
  try {
    const res = await fetch(`${SERVER_URL}/api/connect`, { method: 'POST' });
    return res.json();
  } catch (e) {
    return { ok: false, error: 'Falha ao conectar ao backend' };
  }
}

export async function autoBet(color, amount = 1) {
  if (!SERVER_URL) throw new Error('Backend não configurado');
  const res = await fetch(`${SERVER_URL}/api/auto-bet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ color, amount }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao acionar auto-aposta');
  }
  return res.json();
}