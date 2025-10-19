const LOGIN_URL = process.env.PLAYNABETS_LOGIN_URL || 'https://play.soline.bet/api/auth/login';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { email, password } = JSON.parse(event.body || '{}');
    const body = JSON.stringify({ email: email || process.env.PLAYNABETS_USER, password: password || process.env.PLAYNABETS_PASS });
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await res.json().catch(() => ({}));
    return {
      statusCode: res.ok ? 200 : res.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Falha no login' }) };
  }
};