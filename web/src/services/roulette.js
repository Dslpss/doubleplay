// Utilidades e detector avançado de padrões para Roleta

function isValidNumber(n) {
  const num = Number(n);
  return Number.isFinite(num) && num >= 0 && num <= 36;
}

export function rouletteColumn(num) {
  if (!isValidNumber(num) || num === 0) return null;
  return ((num - 1) % 3) + 1; // 1,2,3
}

export function rouletteDozen(num) {
  if (!isValidNumber(num) || num === 0) return null;
  if (num <= 12) return 1;
  if (num <= 24) return 2;
  return 3;
}

export function rouletteHighLow(num) {
  if (!isValidNumber(num) || num === 0) return null;
  return num <= 18 ? 'low' : 'high';
}

export function rouletteParity(num) {
  if (!isValidNumber(num) || num === 0) return null;
  return num % 2 === 0 ? 'even' : 'odd';
}

export function buildRouletteStats(results = []) {
  const stats = {
    total: 0,
    color: { red: 0, black: 0, green: 0 },
    columns: { 1: 0, 2: 0, 3: 0 },
    dozens: { 1: 0, 2: 0, 3: 0 },
    highlow: { low: 0, high: 0 },
    parity: { even: 0, odd: 0 },
    numbers: {},
  };
  for (const r of results) {
    if (!r) continue;
    stats.total++;
    const c = r.color === 'green' ? 'green' : (r.color === 'red' ? 'red' : 'black');
    stats.color[c] = (stats.color[c] || 0) + 1;
    const num = Number(r.number);
    if (!Number.isFinite(num)) continue;
    const col = rouletteColumn(num);
    const doz = rouletteDozen(num);
    const hl = rouletteHighLow(num);
    const par = rouletteParity(num);
    if (col) stats.columns[col] = (stats.columns[col] || 0) + 1;
    if (doz) stats.dozens[doz] = (stats.dozens[doz] || 0) + 1;
    if (hl) stats.highlow[hl] = (stats.highlow[hl] || 0) + 1;
    if (par) stats.parity[par] = (stats.parity[par] || 0) + 1;
    stats.numbers[num] = (stats.numbers[num] || 0) + 1;
  }
  return stats;
}

export function detectRouletteAdvancedPatterns(results = [], options = {}) {
  const patterns = [];
  if (!Array.isArray(results) || results.length < 3) return patterns;
  const last10 = results.slice(-10);
  const last12 = results.slice(-12);
  const last20 = results.slice(-20);

  const aggressive = Boolean(options.aggressive);
  const T = aggressive ? {
    dozenMin: 5,
    highlowStreak: 3,
    parityStreak: 4,
    rbDiff: 4,
    hotMin: 3,
  } : {
    dozenMin: 6,
    highlowStreak: 4,
    parityStreak: 5,
    rbDiff: 5,
    hotMin: 4,
  };

  // Trinca por coluna
  const c3 = last10.slice(-3).map(r => rouletteColumn(r.number)).filter(Boolean);
  if (c3.length === 3 && c3.every(c => c === c3[0])) {
    patterns.push({ key: 'column_triple', description: `Trinca de coluna ${c3[0]} detectada`, risk: 'medium', targets: { type: 'column', column: c3[0] } });
  }

  // Desequilíbrio por dúzia nos últimos 12
  const d12 = { 1: 0, 2: 0, 3: 0 };
  for (const r of last12) { const d = rouletteDozen(r.number); if (d) d12[d]++; }
  const dMax = Object.entries(d12).sort((a, b) => b[1] - a[1])[0];
  if (dMax && dMax[1] >= T.dozenMin) {
    patterns.push({ key: 'dozen_imbalance', description: `Dúzia ${dMax[0]} mais frequente nos últimos 12`, risk: 'low', targets: { type: 'dozen', dozen: Number(dMax[0]) } });
  }

  // Streak High/Low
  const hlSeq = last10.slice(-T.highlowStreak).map(r => rouletteHighLow(r.number)).filter(Boolean);
  if (hlSeq.length === T.highlowStreak && hlSeq.every(v => v === hlSeq[0])) {
    patterns.push({ key: 'highlow_streak', description: `Sequência de ${hlSeq[0] === 'low' ? 'baixa (1-18)' : 'alta (19-36)'} detectada`, risk: 'medium', targets: { type: 'highlow', value: hlSeq[0] } });
  }

  // Streak paridade
  const pSeq = last10.slice(-T.parityStreak).map(r => rouletteParity(r.number)).filter(Boolean);
  if (pSeq.length === T.parityStreak && pSeq.every(v => v === pSeq[0])) {
    patterns.push({ key: 'parity_streak', description: `Sequência de ${pSeq[0] === 'even' ? 'par' : 'ímpar'} detectada`, risk: 'medium', targets: { type: 'parity', value: pSeq[0] } });
  }

  // Zero recente
  if (last10.some(r => r.number === 0 || r.color === 'green')) {
    patterns.push({ key: 'zero_proximity', description: 'Zero (verde) detectado nos últimos 10', risk: 'high', targets: { type: 'color', color: 'green' } });
  }

  // Desequilíbrio vermelho/preto nos últimos 20
  const rr = last20.filter(r => r.color === 'red').length;
  const bb = last20.filter(r => r.color === 'black').length;
  if (Math.abs(rr - bb) >= T.rbDiff) {
    const dominant = rr > bb ? 'red' : 'black';
    patterns.push({ key: 'red_black_balance', description: `Desequilíbrio recente favorece ${dominant === 'red' ? 'vermelho' : 'preto'}`, risk: 'low', targets: { type: 'color', color: dominant } });
  }

  // Números quentes
  const last30 = results.slice(-30);
  const freq = {};
  for (const r of last30) { const n = Number(r.number); if (Number.isFinite(n)) freq[n] = (freq[n] || 0) + 1; }
  const hot = Object.entries(freq)
    .filter(([n, c]) => Number(n) !== 0 && c >= T.hotMin)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([n]) => Number(n));
  if (hot.length) {
    patterns.push({ key: 'hot_numbers', description: `Números quentes: ${hot.join(', ')}`, risk: 'medium', targets: { type: 'numbers', numbers: hot } });
  }

  return patterns;
}

export function adviceFingerprint(advice) {
  if (!advice) return null;
  switch (advice.type) {
    case 'color': return `color:${advice.color}`;
    case 'column': return `column:${advice.column}`;
    case 'dozen': return `dozen:${advice.dozen}`;
    case 'highlow': return `highlow:${advice.value}`;
    case 'parity': return `parity:${advice.value}`;
    case 'numbers': return `numbers:${(Array.isArray(advice.numbers) ? advice.numbers : []).join('-')}`;
    default: return advice.type;
  }
}

export function chooseRouletteBetSignal(patterns, stats, streaks, results, options = {}) {
  if (!patterns || patterns.length === 0) return null;
  const strategy = options.strategy || 'balanced';
  const lastKey = options.lastKey || null;
  const lastFingerprint = options.lastFingerprint || null;
  const randomizeTopDelta = Number(options.randomizeTopDelta ?? 3);

  const candidates = [];
  for (const p of patterns) {
    switch (p.key) {
      case 'column_triple':
        candidates.push({ key: 'column_triple', type: 'column', column: p.targets.column, risk: p.risk });
        break;
      case 'dozen_imbalance':
        candidates.push({ key: 'dozen_imbalance', type: 'dozen', dozen: p.targets.dozen, risk: p.risk });
        break;
      case 'highlow_streak':
        candidates.push({ key: 'highlow_streak', type: 'highlow', value: p.targets.value, risk: p.risk });
        break;
      case 'parity_streak':
        candidates.push({ key: 'parity_streak', type: 'parity', value: p.targets.value, risk: p.risk });
        break;
      case 'hot_numbers':
        candidates.push({ key: 'hot_numbers', type: 'numbers', numbers: p.targets.numbers, risk: p.risk });
        break;
      case 'red_black_balance':
        candidates.push({ key: 'red_black_balance', type: 'color', color: p.targets.color, risk: p.risk });
        break;
      case 'zero_proximity':
        candidates.push({ key: 'zero_proximity', type: 'color', color: 'green', risk: p.risk });
        break;
      default:
        break;
    }
  }

  if (candidates.length === 0) return null;

  if (strategy === 'priority') {
    const order = ['column_triple', 'dozen_imbalance', 'highlow_streak', 'parity_streak', 'hot_numbers', 'red_black_balance', 'zero_proximity'];
    const selected = order.map(k => candidates.find(c => c.key === k)).find(Boolean);
    return selected || null;
  }

  const riskWeight = (r) => (r === 'low' ? 2 : r === 'medium' ? 1 : 0);
  const scored = candidates
    .map(advice => {
      const chance = computeRouletteSignalChance(advice, results);
      const penaltyKey = lastKey && advice.key === lastKey ? 3 : 0;
      const fp = adviceFingerprint(advice);
      const penaltyFingerprint = lastFingerprint && fp === lastFingerprint ? 8 : 0;
      const score = chance + riskWeight(advice.risk) - penaltyKey - penaltyFingerprint;
      return { advice, chance, score };
    })
    .sort((a, b) => b.score - a.score);

  const topScore = scored[0].score;
  const nearTop = scored.filter(s => (topScore - s.score) <= randomizeTopDelta);
  const pick = nearTop[Math.floor(Math.random() * nearTop.length)] || scored[0];
  return { ...pick.advice };
}

export function computeRouletteSignalChance(advice, results) {
  const sample = results.slice(-50);
  const s = buildRouletteStats(sample);
  const total = s.total || 0;
  const pct = (n, base) => total >= 10 ? Math.round(((n || 0) / total) * 100) : base;

  let base = 0;
  let bonus = 0;

  switch (advice?.type) {
    case 'color': {
      const color = advice.color || 'red';
      const baseFallback = color === 'green' ? 2 : 48;
      base = pct(s.color[color], baseFallback);
      break;
    }
    case 'column': {
      const c = advice.column || 1;
      base = pct(s.columns[c], 32);
      // bônus por trinca
      bonus += 8;
      break;
    }
    case 'dozen': {
      const d = advice.dozen || 1;
      base = pct(s.dozens[d], 32);
      bonus += 6;
      break;
    }
    case 'highlow': {
      const v = advice.value || 'low';
      base = pct(s.highlow[v], 48);
      bonus += 5;
      break;
    }
    case 'parity': {
      const v = advice.value || 'even';
      base = pct(s.parity[v], 48);
      bonus += 4;
      break;
    }
    case 'numbers': {
      const arr = Array.isArray(advice.numbers) ? advice.numbers : [];
      const sum = arr.reduce((acc, n) => acc + (s.numbers[n] || 0), 0);
      base = pct(sum, Math.max(6, Math.round((arr.length / 37) * 100))); // aproximação
      bonus += Math.min(6, arr.length * 1.5);
      break;
    }
    default: base = 10;
  }

  let chance = Math.round(base + bonus);
  chance = Math.max(3, Math.min(85, chance));
  return chance;
}

export function adviceLabelPt(advice) {
  if (!advice) return '';
  switch (advice.type) {
    case 'color': return advice.color === 'red' ? 'vermelho' : advice.color === 'black' ? 'preto' : 'verde (0)';
    case 'column': return `coluna ${advice.column}`;
    case 'dozen': return `dúzia ${advice.dozen}`;
    case 'highlow': return advice.value === 'low' ? 'baixa (1–18)' : 'alta (19–36)';
    case 'parity': return advice.value === 'even' ? 'par' : 'ímpar';
    case 'numbers': return `números ${advice.numbers.join(', ')}`;
    default: return 'aposta';
  }
}