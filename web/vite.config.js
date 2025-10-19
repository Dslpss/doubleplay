import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const SERVER_URL = env.VITE_SERVER_URL || null

  return {
    plugins: [
      react(),
      {
        name: 'sse-events-middleware',
        configureServer(server) {
          server.middlewares.use('/events', async (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            const send = (event, data) => {
              const payload = typeof data === 'string' ? data : JSON.stringify(data);
              res.write(`event: ${event}\n`);
              res.write(`data: ${payload}\n\n`);
            };
            send('status', { type: 'status', connected: true, ts: Date.now(), source: SERVER_URL ? 'local-server' : 'vite' });

            let lastKey = null;
            const tick = async () => {
              if (SERVER_URL) {
                try {
                  const r = await fetch(`${SERVER_URL}/api/status`, { headers: { 'accept': 'application/json' } });
                  if (r.ok) {
                    const json = await r.json();
                    const lp = json?.lastPayload || null;
                    const key = lp ? JSON.stringify(lp).slice(0, 400) : null;
                    if (key && key !== lastKey) {
                      lastKey = key;
                      send('double_result', { type: 'double_result', data: lp });
                    }
                    const bets = json?.betsPopularity;
                    if (bets) send('bets_popularity', { type: 'bets_popularity', data: bets });
                  }
                } catch (err) {
                  // silencioso
                }
              } else {
                send('ping', { type: 'status', connected: true, ts: Date.now() });
              }
              setTimeout(tick, SERVER_URL ? 1000 : 5000);
            };

            tick();
            req.on('close', () => { /* encerra */ });
          });
        }
      }
    ],
  }
})
