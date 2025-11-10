/* eslint-env node */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  // Simples status OK; a conexão real é reportada via SSE
  res.status(200).json({ ok: true, wsConnected: true, hasToken: false });
}