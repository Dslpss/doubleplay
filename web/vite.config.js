import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'sse-events-middleware',
      configureServer(server) {
        server.middlewares.use('/events', (req, res) => {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          const send = (event, data) => {
            const payload = typeof data === 'string' ? data : JSON.stringify(data);
            res.write(`event: ${event}\n`);
            res.write(`data: ${payload}\n\n`);
          };
          send('status', { type: 'status', connected: true, ts: Date.now() });
          const interval = setInterval(() => send('ping', { type: 'status', connected: true, ts: Date.now() }), 5000);
          req.on('close', () => clearInterval(interval));
        });
      }
    }
  ],
})
