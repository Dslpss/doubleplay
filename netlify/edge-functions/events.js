export default async (request, context) => {
  const stream = new ReadableStream({
    start(controller) {
      const enc = (event, data) => {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        controller.enqueue(`event: ${event}\n`);
        controller.enqueue(`data: ${payload}\n\n`);
      };
      enc('status', { type: 'status', connected: true, ts: Date.now() });
      const interval = setInterval(() => enc('ping', { type: 'status', connected: true, ts: Date.now() }), 5000);
      // Nota: não fechamos explicitamente para manter conexão aberta
      // Cancelamento limpa o intervalo
      this.cancel = () => clearInterval(interval);
    },
    cancel() {
      // se existir, limpa
      if (this.cancel) this.cancel();
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    },
  });
};