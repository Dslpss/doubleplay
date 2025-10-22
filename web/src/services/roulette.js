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

// Adições: ordem da roda europeia e setores clássicos
export const EU_WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

export const SECTOR_VOISINS = [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25];
export const SECTOR_TIERS = [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33];
export const SECTOR_ORPHELINS = [17, 34, 6, 1, 20, 14, 31, 9];
export const SECTOR_JEU_ZERO = [12, 35, 3, 26, 0, 32, 15];

export function wheelIndexOf(num) {
  return EU_WHEEL_ORDER.indexOf(Number(num));
}

export function neighborsOf(num, k = 2) {
  const idx = wheelIndexOf(num);
  if (idx < 0) return [];
  const out = [];
  for (let d = -k; d <= k; d++) {
    let pos = (idx + d) % EU_WHEEL_ORDER.length;
    if (pos < 0) pos += EU_WHEEL_ORDER.length;
    out.push(EU_WHEEL_ORDER[pos]);
  }
  return out;
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
  const last24 = results.slice(-24);
  const last15 = results.slice(-15);

  const aggressive = Boolean(options.aggressive);
  const T = aggressive ? {
    dozenMin: 5,
    highlowStreak: 3,
    parityStreak: 4,
    rbDiff: 4,
    hotMin: 3,
    sectorMin: 8,
    finalsMin: 5,
    clusterArcMax: 7,
  } : {
    dozenMin: 5,        // Reduzido de 6 para 5 (igual ao agressivo)
    highlowStreak: 3,   // Reduzido de 4 para 3 (igual ao agressivo)
    parityStreak: 4,    // Reduzido de 5 para 4 (igual ao agressivo)
    rbDiff: 4,          // Reduzido de 5 para 4 (igual ao agressivo)
    hotMin: 3,          // Reduzido de 4 para 3 (igual ao agressivo)
    sectorMin: 8,       // Reduzido de 9 para 8 (igual ao agressivo)
    finalsMin: 5,       // Reduzido de 6 para 5 (igual ao agressivo)
    clusterArcMax: 7,   // Mantido igual
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

  // Setores da roda (Voisins/Tiers/Orphelins/Jeu Zéro) nos últimos 24
  const sectorCounts = { voisins: 0, tiers: 0, orphelins: 0, jeu_zero: 0 };
  for (const r of last24) {
    const n = Number(r.number);
    if (!Number.isFinite(n)) continue;
    if (SECTOR_VOISINS.includes(n)) sectorCounts.voisins++;
    if (SECTOR_TIERS.includes(n)) sectorCounts.tiers++;
    if (SECTOR_ORPHELINS.includes(n)) sectorCounts.orphelins++;
    if (SECTOR_JEU_ZERO.includes(n)) sectorCounts.jeu_zero++;
  }
  if (sectorCounts.voisins >= T.sectorMin)
    patterns.push({ key: 'sector_voisins', description: 'Voisins du Zéro frequente nos últimos 24', risk: 'medium', targets: { type: 'numbers', numbers: SECTOR_VOISINS } });
  if (sectorCounts.tiers >= T.sectorMin)
    patterns.push({ key: 'sector_tiers', description: 'Tiers du Cylindre frequente nos últimos 24', risk: 'medium', targets: { type: 'numbers', numbers: SECTOR_TIERS } });
  if (sectorCounts.orphelins >= T.sectorMin)
    patterns.push({ key: 'sector_orphelins', description: 'Orphelins frequente nos últimos 24', risk: 'medium', targets: { type: 'numbers', numbers: SECTOR_ORPHELINS } });
  if (sectorCounts.jeu_zero >= Math.max(5, Math.round(T.sectorMin * 0.7)))
    patterns.push({ key: 'sector_jeu_zero', description: 'Jeu Zéro frequente nos últimos 24', risk: 'medium', targets: { type: 'numbers', numbers: SECTOR_JEU_ZERO } });

  // Finales (dígitos finais) nos últimos 15
  const finalCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  for (const r of last15) {
    const n = Number(r.number);
    if (!Number.isFinite(n)) continue;
    const d = n % 10; finalCounts[d]++;
  }
  const finalsNumbers = {
    0: [0, 10, 20, 30], 1: [1, 11, 21, 31], 2: [2, 12, 22, 32], 3: [3, 13, 23, 33],
    4: [4, 14, 24, 34], 5: [5, 15, 25, 35], 6: [6, 16, 26, 36], 7: [7, 17, 27], 8: [8, 18, 28], 9: [9, 19, 29]
  };
  const finalsSorted = Object.entries(finalCounts).sort((a, b) => b[1] - a[1]);
  const topFinal = finalsSorted[0];
  if (topFinal && topFinal[1] >= T.finalsMin) {
    const d = Number(topFinal[0]);
    patterns.push({ key: `final_digit_${d}`, description: `Final ${d} frequente nos últimos 15`, risk: 'medium', targets: { type: 'numbers', numbers: finalsNumbers[d] } });
  }

  // Cluster de vizinhos na roda com últimos 7
  const last7 = results.slice(-7);
  const positions = last7.map(r => wheelIndexOf(r.number)).filter(p => p >= 0);
  if (positions.length >= 5) {
    const sorted = [...positions].sort((a, b) => a - b);
    const n = EU_WHEEL_ORDER.length;
    let maxGap = -1; let gapIdx = -1;
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const b = sorted[(i + 1) % sorted.length];
      const gap = (b - a + n) % n;
      if (gap > maxGap) { maxGap = gap; gapIdx = i; }
    }
    const arcLen = n - maxGap;
    if (arcLen <= T.clusterArcMax) {
      // centro aproximado: posição após o maior gap
      const start = sorted[(gapIdx + 1) % sorted.length];
      const center = (start + Math.floor(arcLen / 2)) % n;
      const centerNum = EU_WHEEL_ORDER[center];
      const neigh = neighborsOf(centerNum, 2);
      patterns.push({ key: 'neighbors_cluster', description: `Cluster na roda detectado (arco ${arcLen})`, risk: 'medium', targets: { type: 'numbers', numbers: neigh } });
    }
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
  const randomizeTopDelta = Number(options.randomizeTopDelta ?? 5); // Aumentado de 3 para 5

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
      case 'sector_voisins':
      case 'sector_tiers':
      case 'sector_orphelins':
      case 'sector_jeu_zero':
      case 'neighbors_cluster':
      default:
        if (p.targets?.type === 'numbers') {
          candidates.push({ key: p.key, type: 'numbers', numbers: p.targets.numbers, risk: p.risk });
        }
        break;
    }
  }

  if (candidates.length === 0) return null;

  if (strategy === 'priority') {
    const order = ['column_triple', 'dozen_imbalance', 'highlow_streak', 'parity_streak', 'hot_numbers', 'red_black_balance', 'zero_proximity', 'sector_voisins', 'sector_tiers', 'sector_orphelins', 'sector_jeu_zero', 'neighbors_cluster'];
    const selected = order.map(k => candidates.find(c => c.key === k)).find(Boolean);
    return selected || null;
  }

  const riskWeight = (r) => (r === 'low' ? 2 : r === 'medium' ? 1 : 0);
  const scored = candidates
    .map(advice => {
      const chance = computeRouletteSignalChance(advice, results);
      // Reduzir penalidade por repetição de chave para permitir mais diversidade
      const penaltyKey = lastKey && advice.key === lastKey ? 1 : 0; // Reduzido de 3 para 1
      const fp = adviceFingerprint(advice);
      // Incluir chave do padrão no fingerprint para comparação mais específica
      const fullFp = `${advice.key || 'unknown'}:${fp}`;
      const penaltyFingerprint = lastFingerprint && fullFp === lastFingerprint ? 4 : 0; // Reduzido de 8 para 4
      const score = chance + riskWeight(advice.risk) - penaltyKey - penaltyFingerprint;
      return { advice, chance, score, fullFp };
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