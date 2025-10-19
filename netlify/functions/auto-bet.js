exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const payload = JSON.parse(event.body || '{}');
    // Aqui apenas ecoamos; em backend real, chamaríamos serviço de aposta.
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, received: payload }),
    };
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Payload inválido' }) };
  }
};