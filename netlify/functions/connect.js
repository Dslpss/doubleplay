exports.handler = async function () {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, message: 'Sem backend persistente; conexão WS não disponível em Functions.' }),
  };
};