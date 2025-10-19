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