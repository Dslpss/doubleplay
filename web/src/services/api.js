const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

export async function login(email, password) {
  const res = await fetch(`${SERVER_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function status() {
  const res = await fetch(`${SERVER_URL}/api/status`);
  return res.json();
}

export async function connectWsBridge() {
  const res = await fetch(`${SERVER_URL}/api/connect`, { method: 'POST' });
  return res.json();
}

export async function autoBet(color, amount = 1) {
  const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';
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