exports.handler = async function () {
  const hasUser = !!process.env.PLAYNABETS_USER;
  const hasPass = !!process.env.PLAYNABETS_PASS;
  const hasLoginUrl = !!process.env.PLAYNABETS_LOGIN_URL;
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, wsConnected: true, hasToken: false, hasUser, hasPass, hasLoginUrl }),
  };
};