exports.handler = async function () {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, message: 'Bridge de tempo real via Edge (/events). Reconexão automática.' }),
  };
};