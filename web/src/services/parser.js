// Parser alinhado ao integrador: usa campo 'value' 0-14
// 0 -> white, 1-7 -> red, 8-14 -> black
export function parseDoublePayload(payload) {
  try {
    if (!payload || typeof payload !== 'object') return null;
    const value = payload.value ?? payload.number ?? payload.n ?? payload.roll ?? payload.result;
    if (value === undefined || value === null) return null;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0 || num > 14) return null;
    const color = num === 0 ? 'white' : num <= 7 ? 'red' : 'black';
    return {
      number: num,
      color,
      round_id: payload.round_id ?? payload.roundId ?? payload.gameId ?? `round_${Date.now()}`,
      timestamp: payload.timestamp ?? Date.now(),
      source: payload.source ?? 'playnabets',
      raw: payload,
    };
  } catch {
    return null;
  }
}

export function summarizeResults(results) {
  const stats = { red: 0, black: 0, white: 0, odd: 0, even: 0, total: 0 };
  for (const r of results) {
    if (!r) continue;
    stats.total++;
    stats[r.color]++;
    if (r.number !== 0) {
      if (r.number % 2 === 0) stats.even++; else stats.odd++;
    }
  }
  return stats;
}

export function computeStreaks(results) {
  const out = { current: { color: null, length: 0 }, max: { red: 0, black: 0, white: 0 } };
  let curColor = null;
  let curLen = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];
    if (!r) continue;
    if (curColor === null) { curColor = r.color; curLen = 1; }
    else if (r.color === curColor) curLen++;
    else break;
  }
  out.current.color = curColor;
  out.current.length = curLen;
  let tmp = 0; let last = null;
  for (const r of results) {
    if (r.color === last) tmp++; else { tmp = 1; last = r.color; }
    out.max[r.color] = Math.max(out.max[r.color], tmp);
  }
  return out;
}

export function detectSimplePatterns(results) {
  const patterns = [];
  if (results.length < 3) return patterns;
  const last = results.slice(-5);
  // Triple repeat: três últimas da mesma cor
  const c3 = last.slice(-3).map(r => r.color);
  if (c3.every(c => c === c3[0])) {
    patterns.push({ key: 'triple_repeat', description: `Trinca de ${c3[0]} detectada`, risk: 'medium' });
  }
  // White proximity: branco apareceu nos últimos 10
  const recent = results.slice(-10);
  if (recent.some(r => r.color === 'white')) {
    patterns.push({ key: 'white_proximity', description: 'Branco recente detectado (últimos 10)', risk: 'high' });
  }
  // Red/Black balance: diferença > 4 nos últimos 20
  const last20 = results.slice(-20);
  const rr = last20.filter(r => r.color === 'red').length;
  const bb = last20.filter(r => r.color === 'black').length;
  if (Math.abs(rr - bb) >= 5) {
    const dominant = rr > bb ? 'red' : 'black';
    patterns.push({ key: 'red_black_balance', description: `Desequilíbrio recente favorece ${dominant}`, risk: 'low' });
  }
  return patterns;
}

// Detecta apostas do usuário dentro dos eventos recentes
export function analyzeUserBets(events = []) {
  const summary = { total: 0, red: 0, black: 0, white: 0, sampled: 0 };
  if (!Array.isArray(events)) return summary;

  const isBetEvent = (evt) => {
    const t = String(evt?.type || '').toLowerCase();
    const data = evt?.data || evt;
    if (t.includes('bet') || t.includes('aposta') || t.includes('placebet') || t.includes('wager') || t.includes('stake')) return true;
    if (data && (Object.prototype.hasOwnProperty.call(data, 'bet') || Object.prototype.hasOwnProperty.call(data, 'aposta'))) return true;
    if (typeof data?.action === 'string' && data.action.toLowerCase().includes('bet')) return true;
    return false;
  };

  const detectColor = (evt) => {
    const data = evt?.data || evt;
    const candidates = [data?.color, data?.betColor, data?.selection, data?.side, data?.bet?.color, data?.aposta?.cor];
    for (const c of candidates) {
      if (typeof c === 'string') {
        const s = c.toLowerCase();
        if (s.includes('red') || s.includes('vermelho')) return 'red';
        if (s.includes('black') || s.includes('preto')) return 'black';
        if (s.includes('white') || s.includes('branco')) return 'white';
      }
    }
    // fallback: busca em texto
    const text = JSON.stringify(evt).toLowerCase();
    if (text.includes('vermelho') || text.includes('red')) return 'red';
    if (text.includes('preto') || text.includes('black')) return 'black';
    if (text.includes('branco') || text.includes('white')) return 'white';
    return null;
  };

  for (const e of events) {
    summary.sampled++;
    if (!isBetEvent(e)) continue;
    const color = detectColor(e);
    if (!color) continue;
    summary[color]++;
    summary.total++;
  }

  const pct = (n) => (summary.total ? Math.round((n / summary.total) * 100) : 0);
  summary.pct = { red: pct(summary.red), black: pct(summary.black), white: pct(summary.white) };
  return summary;
}