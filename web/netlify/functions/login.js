const DEFAULT_LOGIN_URL = 'https://loki1.weebet.tech/auth/login';
const LOGIN_URL = process.env.PLAYNABETS_LOGIN_URL || DEFAULT_LOGIN_URL;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { email, username, password } = JSON.parse(event.body || '{}');
    const user = username || email || process.env.PLAYNABETS_USER;
    const pass = password || process.env.PLAYNABETS_PASS;

    // Alinhar com fluxo de dev (server/index.js)
    const body = JSON.stringify({
      username: user,
      password: pass,
      googleId: '',
      googleIdToken: '',
      loginMode: 'email',
      cookie: '',
      ignorarValidacaoEmailObrigatoria: true,
      betting_shop_code: null,
    });

    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Referer': 'https://playnabets.com/',
        'Origin': 'https://playnabets.com',
      },
      body,
    });

    let data = {};
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    const ok = res.ok && (data?.success === true || data?.success === 'true');
    const tokenCassino = data?.results?.tokenCassino || data?.tokenCassino || data?.token || null;

    const payload = ok ? data : { ok: false, statusUpstream: res.status, data };

    return {
      statusCode: ok ? 200 : res.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Falha no login', message: e.message || String(e) }) };
  }
};