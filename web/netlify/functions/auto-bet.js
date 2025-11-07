export async function handler(event) {
  const commonHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: commonHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: commonHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const raw = event.body;
    const payload =
      typeof raw === 'string'
        ? JSON.parse(raw || '{}')
        : raw && typeof raw === 'object'
        ? raw
        : {};

    // Aqui apenas ecoamos; em backend real, chamaríamos serviço de aposta.
    return {
      statusCode: 200,
      headers: commonHeaders,
      body: JSON.stringify({ ok: true, received: payload }),
    };
  } catch (e) {
    return {
      statusCode: 400,
      headers: commonHeaders,
      body: JSON.stringify({ error: 'Payload inválido', details: String(e?.message || e) }),
    };
  }
}