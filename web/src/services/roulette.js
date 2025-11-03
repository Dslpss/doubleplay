// Utilidades e detector avançado de padrões para Roleta

// ============================================================================
// SISTEMA DE PONTUAÇÃO E PRIORIZAÇÃO DE PADRÕES
// ============================================================================

/**
 * Prioridades dos padrões baseadas em confiabilidade estatística e física da roleta
 * Escala: 1-10 (10 = mais confiável)
 */
export const PATTERN_PRIORITIES = {
  // ============================================================================
  // APENAS PADRÕES POPULARES E COMPROVADOS DA ROLETA
  // Mantidos apenas os padrões baseados em física da roleta e estatística real
  // ============================================================================

  // Padrões de SETORES CLÁSSICOS (mais confiáveis - baseados na roda física)
  sector_voisins: 10, // Voisins du Zero - 17 números ao redor do zero
  sector_tiers: 10, // Tiers du Cylindre - 12 números opostos ao zero
  sector_orphelins: 10, // Orphelins - 8 números "órfãos"
  neighbors_cluster: 9, // Agrupamento geográfico na roda

  // Padrões de VIZINHANÇA (muito populares)
  neighbors_bet: 8, // Vizinhos diretos do último número
  neighbors_last: 8, // Região vizinha ao último

  // Padrões de NÚMEROS QUENTES (estatística simples)
  hot_numbers: 8, // Números que estão caindo muito

  // Padrões de COLUNAS e DÚZIAS (apostas populares)
  column_cold: 7, // Coluna que não cai há muito tempo
  dozen_cold: 7, // Dúzia ausente
  column_triple: 6, // Mesma coluna 3x seguidas
  dozen_triple: 6, // Mesma dúzia 3x seguidas

  // Padrões de CORES (mais simples e populares)
  red_black_balance: 6, // Desequilíbrio vermelho/preto
  color_streak: 5, // Sequência de mesma cor (5+ vezes)
  
  // Padrões de APOSTAS EXTERNAS (Par/Ímpar, Alto/Baixo)
  parity_imbalance: 5, // Desequilíbrio par/ímpar
  highlow_imbalance: 5, // Desequilíbrio alto (19-36) / baixo (1-18)
  even_streak: 5, // Sequência de pares
  odd_streak: 5, // Sequência de ímpares
  high_streak: 5, // Sequência de altos (19-36)
  low_streak: 5, // Sequência de baixos (1-18)
};
/**
 * Configuração de sinais inteligentes
 */
export const SIGNAL_CONFIG = {
  MIN_CONFIDENCE: 7.0, // Confiança mínima para emitir sinal (0-10) - aumentado para padrões de qualidade
  COOLDOWN_AFTER_WIN: 10000, // 10s após acerto
  COOLDOWN_AFTER_LOSS: 5000, // 5s após erro
  MIN_RESULTS_BETWEEN: 2, // Mínimo 2 resultados novos
  MAX_SIGNALS_PER_MINUTE: 4, // Máximo 4 sinais/minuto (reduzido para focar em qualidade)
  PATTERN_MIN_OCCURRENCE: 3, // Padrão precisa aparecer 3x mínimo
  LEARNING_THRESHOLD: 8, // Tentativas mínimas para aprender (reduzido)
  MIN_ACCURACY: 55, // Acurácia mínima % para continuar emitindo (aumentado)
  RESET_THRESHOLD: 15, // Após 15 tentativas, dá segunda chance (reduzido)
};

/**
 * Sistema de aprendizado contínuo para padrões
 */
class PatternLearner {
  constructor() {
    this.patternStats = this._loadFromStorage() || {};
    this.thresholdAdjustments = {};
    this.lastSignalTime = 0;
    this.signalsThisMinute = [];
  }

  _loadFromStorage() {
    if (typeof localStorage === "undefined") return null;
    try {
      const data = localStorage.getItem("roulette_pattern_stats");
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  _saveToStorage() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(
        "roulette_pattern_stats",
        JSON.stringify(this.patternStats)
      );
    } catch {
      // Ignorar erros de storage
    }
  }

  recordOutcome(patternKey, hit, targets = []) {
    if (!this.patternStats[patternKey]) {
      this.patternStats[patternKey] = {
        hits: 0,
        misses: 0,
        targets: [],
        lastUpdate: Date.now(),
      };
    }

    const stats = this.patternStats[patternKey];
    if (hit) {
      stats.hits++;
    } else {
      stats.misses++;
    }
    stats.lastUpdate = Date.now();

    // Guardar targets para análise
    if (targets.length > 0) {
      stats.targets.push({ numbers: targets, hit, ts: Date.now() });
      // Manter apenas últimos 50 registros
      if (stats.targets.length > 50) {
        stats.targets = stats.targets.slice(-50);
      }
    }

    this._saveToStorage();
  }

  getPatternAccuracy(patternKey) {
    const stats = this.patternStats[patternKey];
    if (!stats) return 50; // Default neutro

    const total = stats.hits + stats.misses;
    if (total === 0) return 50;

    return (stats.hits / total) * 100;
  }

  getTotalAttempts(patternKey) {
    const stats = this.patternStats[patternKey];
    if (!stats) return 0;
    return stats.hits + stats.misses;
  }

  shouldEmitPattern(patternKey, baseConfidence) {
    const accuracy = this.getPatternAccuracy(patternKey);
    const attempts = this.getTotalAttempts(patternKey);

    // Fase de aprendizado (primeiras tentativas)
    if (attempts < SIGNAL_CONFIG.LEARNING_THRESHOLD) {
      return baseConfidence >= SIGNAL_CONFIG.MIN_CONFIDENCE;
    }

    // Segunda chance: após muitas tentativas, reseta bloqueio
    if (
      attempts >= SIGNAL_CONFIG.RESET_THRESHOLD &&
      accuracy < SIGNAL_CONFIG.MIN_ACCURACY
    ) {
      console.log(
        `[PatternLearner] ${patternKey}: Segunda chance após ${attempts} tentativas (acc: ${accuracy.toFixed(
          1
        )}%)`
      );
      // Reset stats para dar nova oportunidade
      this.patternStats[patternKey] = { hits: 0, misses: 0 };
      return baseConfidence >= SIGNAL_CONFIG.MIN_CONFIDENCE;
    }

    // Fase madura: exigir acurácia mínima
    const meetsAccuracy = accuracy >= SIGNAL_CONFIG.MIN_ACCURACY;
    const meetsConfidence = baseConfidence >= SIGNAL_CONFIG.MIN_CONFIDENCE;

    return meetsAccuracy && meetsConfidence;
  }

  adjustThreshold(patternKey, increase = false) {
    if (!this.thresholdAdjustments[patternKey]) {
      this.thresholdAdjustments[patternKey] = 0;
    }

    // Ajustar threshold em 0.5 pontos
    this.thresholdAdjustments[patternKey] += increase ? 0.5 : -0.5;

    // Limitar ajuste entre -2 e +2
    this.thresholdAdjustments[patternKey] = Math.max(
      -2,
      Math.min(2, this.thresholdAdjustments[patternKey])
    );
  }

  getAdjustedThreshold(patternKey, baseThreshold) {
    const adjustment = this.thresholdAdjustments[patternKey] || 0;
    return baseThreshold + adjustment;
  }

  canEmitSignal() {
    const now = Date.now();

    // Limpar sinais antigos (> 1 minuto)
    this.signalsThisMinute = this.signalsThisMinute.filter(
      (ts) => now - ts < 60000
    );

    // Verificar limite de sinais por minuto
    if (this.signalsThisMinute.length >= SIGNAL_CONFIG.MAX_SIGNALS_PER_MINUTE) {
      return false;
    }

    return true;
  }

  markSignalEmitted() {
    this.signalsThisMinute.push(Date.now());
    this.lastSignalTime = Date.now();
  }

  getStats() {
    const stats = {};
    for (const [key, data] of Object.entries(this.patternStats)) {
      const total = data.hits + data.misses;
      stats[key] = {
        accuracy: total > 0 ? ((data.hits / total) * 100).toFixed(1) : "N/A",
        attempts: total,
        hits: data.hits,
        misses: data.misses,
      };
    }
    return stats;
  }

  reset() {
    this.patternStats = {};
    this.thresholdAdjustments = {};
    this._saveToStorage();
  }
}

// Instância global do aprendizado
const patternLearner = new PatternLearner();

// Exportar para uso externo
export function getPatternLearner() {
  return patternLearner;
}

export function recordPatternOutcome(patternKey, hit, targets = []) {
  patternLearner.recordOutcome(patternKey, hit, targets);
}

export function getPatternStats() {
  return patternLearner.getStats();
}

export function resetPatternLearning() {
  patternLearner.reset();
}

// ============================================================================
// VALIDAÇÃO E UTILITÁRIOS
// ============================================================================

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
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const SECTOR_VOISINS = [22, 18, 29, 7, 28, 12, 35, 3, 26];
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
  return num <= 18 ? "low" : "high";
}

export function rouletteParity(num) {
  if (!isValidNumber(num) || num === 0) return null;
  return num % 2 === 0 ? "even" : "odd";
}

// --- Helpers estatísticos/temporais ---
// Contagens ponderadas por recência (decay exponencial)
export function computeWeightedCounts(results, alpha = 0.25) {
  // alpha: peso do mais recente (0..1). Quanto maior, mais peso no recente.
  const weights = [];
  const n = results.length;
  // t = 0 mais recente (end of array) => we'll iterate from end-1..0
  let totalWeight = 0;
  for (let i = n - 1; i >= 0; i--) {
    const t = n - 1 - i;
    const w = alpha * Math.pow(1 - alpha, t);
    weights[i] = w;
    totalWeight += w;
  }

  const counts = {
    numbers: {},
    colors: { red: 0, black: 0, green: 0 },
    columns: { 1: 0, 2: 0, 3: 0 },
    dozens: { 1: 0, 2: 0, 3: 0 },
    finals: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
  };

  for (let i = 0; i < n; i++) {
    const r = results[i];
    const w = weights[i] || 0;
    if (!r) continue;
    const num = Number(r.number);
    const col =
      r.color || (num === 0 ? "green" : num % 2 === 0 ? "black" : "red");
    counts.colors[col] = (counts.colors[col] || 0) + w;
    if (Number.isFinite(num)) {
      counts.numbers[num] = (counts.numbers[num] || 0) + w;
      const c = rouletteColumn(num);
      const d = rouletteDozen(num);
      if (c) counts.columns[c] = (counts.columns[c] || 0) + w;
      if (d) counts.dozens[d] = (counts.dozens[d] || 0) + w;
      counts.finals[num % 10] = (counts.finals[num % 10] || 0) + w;
    }
  }

  // normalize by totalWeight to keep values comparable
  if (totalWeight > 0) {
    for (const k of Object.keys(counts.colors)) counts.colors[k] /= totalWeight;
    for (const k of Object.keys(counts.columns))
      counts.columns[k] /= totalWeight;
    for (const k of Object.keys(counts.dozens)) counts.dozens[k] /= totalWeight;
    for (const k of Object.keys(counts.finals)) counts.finals[k] /= totalWeight;
    for (const k of Object.keys(counts.numbers))
      counts.numbers[k] /= totalWeight;
  }

  return counts;
}

// Matriz de transição simples P(next | current) estimada a partir do histórico
export function buildTransitionMatrix(results, smoothing = 1) {
  const N = 37;
  const counts = Array.from({ length: N }, () => Array(N).fill(0));
  for (let i = 0; i < results.length - 1; i++) {
    const a = Number(results[i].number);
    const b = Number(results[i + 1].number);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    counts[a][b] = (counts[a][b] || 0) + 1;
  }
  // normalize rows with smoothing (Laplace)
  const mat = counts.map((row) => {
    const s = row.reduce((x, y) => x + y, 0) + smoothing * N;
    return row.map((c) => (c + smoothing) / s);
  });
  return mat; // mat[current][next]
}

// Em memória: log de sinais para backtest e análises
const _signalLog = [];
export function logSignal(entry) {
  try {
    _signalLog.push({ ts: Date.now(), ...entry });
  } catch {
    // ignore
  }
}
export function getSignalLog() {
  return _signalLog.slice();
}

// Sistema de controle inteligente de sinais
let lastSignalTimestamp = 0;
let signalCooldownActive = false;
const SIGNAL_COOLDOWN_MS = 4000; // Reduzido de 10s para 4s entre sinais
const MIN_RESULTS_AFTER_SIGNAL = 1; // Reduzido de 2 para 1 resultado mínimo

export function setSignalCooldown(timestamp = Date.now()) {
  lastSignalTimestamp = timestamp;
  signalCooldownActive = true;
}

export function clearSignalCooldown() {
  signalCooldownActive = false;
}

export function isSignalCooldownActive() {
  if (!signalCooldownActive) return false;
  const timePassed = Date.now() - lastSignalTimestamp;
  if (timePassed >= SIGNAL_COOLDOWN_MS) {
    signalCooldownActive = false;
    return false;
  }
  return true;
}

// Configurações para diferentes estratégias de reset adaptativo
export const ADAPTIVE_RESET_STRATEGIES = {
  FULL_RESET: "full_reset", // Esquece tudo após cada sinal
  SLIDING_WINDOW: "sliding_window", // Janela deslizante fixa
  CONDITIONAL_RESET: "conditional_reset", // Reset baseado em condições
  HYBRID: "hybrid", // Combinação de estratégias
};

export function getEffectiveResults(
  results,
  lastSignalIndex = -1,
  options = {}
) {
  if (!Array.isArray(results) || results.length === 0) return [];

  const strategy = options.strategy || ADAPTIVE_RESET_STRATEGIES.SLIDING_WINDOW; // Mudado de FULL_RESET para SLIDING_WINDOW
  const windowSize = options.windowSize || 30; // Aumentado de 50 para 30 (mais responsivo)
  const minResultsAfterSignal =
    options.minResultsAfterSignal || MIN_RESULTS_AFTER_SIGNAL;

  switch (strategy) {
    case ADAPTIVE_RESET_STRATEGIES.FULL_RESET:
      return getFullResetResults(
        results,
        lastSignalIndex,
        minResultsAfterSignal
      );

    case ADAPTIVE_RESET_STRATEGIES.SLIDING_WINDOW:
      return getSlidingWindowResults(results, windowSize);

    case ADAPTIVE_RESET_STRATEGIES.CONDITIONAL_RESET:
      return getConditionalResetResults(results, lastSignalIndex, options);

    case ADAPTIVE_RESET_STRATEGIES.HYBRID:
      return getHybridResults(results, lastSignalIndex, options);

    default:
      return getSlidingWindowResults(results, windowSize); // Mudado para SLIDING_WINDOW como fallback
  }
}

// Estratégia 1: Reset completo após cada sinal (responsivo)
function getFullResetResults(results, lastSignalIndex, minResultsAfterSignal) {
  // Após um sinal, prioriza apenas os resultados seguintes,
  // mas mantém responsividade enquanto a amostra ainda é pequena.
  if (lastSignalIndex >= 0) {
    const afterSignal = results.slice(lastSignalIndex + 1);
    const minForPatterns = Math.max(3, minResultsAfterSignal); // precisa ao menos 3 para rodar análises
    if (afterSignal.length >= minForPatterns) {
      // Limitar janela para evitar dados antigos demais
      return afterSignal.slice(-30);
    }
    // Fallback temporário: usar últimos 20 resultados gerais
    // até termos amostra suficiente pós-sinal.
    return results.slice(-20);
  }

  // Sem sinal recente: usar janela maior para ser mais responsivo
  return results.slice(-30);
}

// Estratégia 2: Janela deslizante fixa
function getSlidingWindowResults(results, windowSize) {
  return results.slice(-windowSize);
}

// Estratégia 3: Reset condicional baseado em mudanças de padrão
function getConditionalResetResults(results, lastSignalIndex, options) {
  const changeThreshold = options.changeThreshold || 0.3; // 30% de mudança
  const maxLookback = options.maxLookback || 100;

  if (
    lastSignalIndex >= 0 &&
    lastSignalIndex < results.length - MIN_RESULTS_AFTER_SIGNAL
  ) {
    const afterSignal = results.slice(lastSignalIndex + 1);
    const beforeSignal = results.slice(
      Math.max(0, lastSignalIndex - 20),
      lastSignalIndex
    );

    // Verificar se houve mudança significativa no padrão
    if (
      hasSignificantPatternChange(beforeSignal, afterSignal, changeThreshold)
    ) {
      // Se houve mudança, usar apenas resultados após o sinal
      return afterSignal.length >= MIN_RESULTS_AFTER_SIGNAL ? afterSignal : [];
    }
  }

  // Se não houve mudança significativa, usar janela maior
  return results.slice(-maxLookback);
}

// Estratégia 4: Híbrida - combina diferentes abordagens
function getHybridResults(results, lastSignalIndex, options) {
  const maxRecent = options.maxRecent || 15;

  let recentResults = [];

  if (
    lastSignalIndex >= 0 &&
    lastSignalIndex < results.length - MIN_RESULTS_AFTER_SIGNAL
  ) {
    // Dados recentes: após o último sinal
    recentResults = results.slice(
      lastSignalIndex + 1,
      lastSignalIndex + 1 + maxRecent
    );
  } else {
    // Sem sinal recente: usar janela dos últimos maxRecent
    recentResults = results.slice(-maxRecent);
  }

  // Garantir mínimo de resultados para análise
  return recentResults.length >= MIN_RESULTS_AFTER_SIGNAL
    ? recentResults
    : results.slice(-maxRecent);
}

// Função auxiliar para detectar mudanças significativas de padrão
function hasSignificantPatternChange(before, after, threshold) {
  if (before.length < 5 || after.length < 5) return false;

  // Comparar distribuições de cores
  const beforeColors = analyzeColorDistribution(before);
  const afterColors = analyzeColorDistribution(after);

  const colorChange =
    Math.abs(beforeColors.redRatio - afterColors.redRatio) +
    Math.abs(beforeColors.blackRatio - afterColors.blackRatio);

  // Comparar distribuições de números altos/baixos
  const beforeHL = analyzeHighLowDistribution(before);
  const afterHL = analyzeHighLowDistribution(after);

  const hlChange = Math.abs(beforeHL.highRatio - afterHL.highRatio);

  return colorChange > threshold || hlChange > threshold;
}

function analyzeColorDistribution(results) {
  const total = results.length;
  const red = results.filter((r) => r.color === "red").length;
  const black = results.filter((r) => r.color === "black").length;

  return {
    redRatio: red / total,
    blackRatio: black / total,
    greenRatio: (total - red - black) / total,
  };
}

function analyzeHighLowDistribution(results) {
  const total = results.filter((r) => r.number !== 0).length; // Excluir zero
  const high = results.filter((r) => r.number > 18).length;

  return {
    highRatio: high / total,
    lowRatio: (total - high) / total,
  };
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
    const c =
      r.color === "green" ? "green" : r.color === "red" ? "red" : "black";
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

/**
 * Detecta padrões avançados em resultados de roleta usando análise estatística
 * e geográfica da roda. Suporta modo normal e agressivo para diferentes sensibilidades.
 *
 * @param {Array} results - Array de resultados da roleta com {number, color}
 * @param {Object} options - Opções de configuração
 * @param {boolean} options.aggressive - Modo agressivo (thresholds menores)
 * @returns {Array} Array de padrões detectados com {key, description, risk, targets}
 *
 * Padrões detectados:
 * - column_triple: 3 números consecutivos da mesma coluna
 * - red_black_balance: Desequilíbrio de cores
 * - hot_numbers: Números mais frequentes
 * - sector_*: Concentração em setores da roda (Voisins, Tiers, etc.)
 * - finals_*: Concentração em dígitos finais
 * - neighbors_cluster: Agrupamento geográfico na roda
 */
export function detectRouletteAdvancedPatterns(results = [], options = {}) {
  const patterns = [];
  if (!Array.isArray(results) || results.length < 3) return patterns;

  // Verificar cooldown de sinais
  if (isSignalCooldownActive()) {
    return []; // Não detectar padrões durante cooldown
  }

  // Usar resultados efetivos baseados no último sinal com estratégia configurável
  const ro = options.resetOptions || {};
  const resetOptions = {
    strategy:
      ro.strategy ??
      options.resetStrategy ??
      ADAPTIVE_RESET_STRATEGIES.FULL_RESET,
    windowSize: ro.windowSize ?? options.windowSize ?? 50,
    changeThreshold: ro.changeThreshold ?? options.changeThreshold ?? 0.3,
    maxLookback: ro.maxLookback ?? options.maxLookback ?? 100,
    recentWeight: ro.recentWeight ?? options.recentWeight ?? 0.7,
    maxRecent: ro.maxRecent ?? options.maxRecent ?? 15,
    maxHistorical: ro.maxHistorical ?? options.maxHistorical ?? 35,
    minResultsAfterSignal:
      ro.minResultsAfterSignal ??
      options.minResultsAfterSignal ??
      MIN_RESULTS_AFTER_SIGNAL,
  };

  const effectiveResults = getEffectiveResults(
    results,
    options.lastSignalIndex,
    resetOptions
  );
  if (effectiveResults.length < 3) return patterns;

  // Usar resultados efetivos para análise
  const analysisResults = effectiveResults;

  // Janelas de análise otimizadas para diferentes tipos de padrões
  const last10 = analysisResults.slice(-10); // Para padrões de curto prazo
  const last12 = analysisResults.slice(-12); // Para análise de dúzias (12 números por dúzia)
  const last15 = analysisResults.slice(-15); // Para análise de finales
  const last18 = analysisResults.slice(-18); // Para análise de dúzias frias
  const last20 = analysisResults.slice(-20); // Para equilíbrio vermelho/preto
  const last24 = analysisResults.slice(-24); // Para setores da roda

  const aggressive = options.aggressive ?? true;

  // Thresholds diferenciados: modo agressivo detecta padrões mais cedo/facilmente
  // Modo normal é mais conservador, exigindo evidências mais fortes
  const T = aggressive
    ? {
        dozenMin: 3, // Agressivo: detecta com menos ocorrências (reduzido de 4)
        highlowStreak: 3, // Agressivo: sequências menores
        parityStreak: 3, // Agressivo: sequências menores
        rbDiff: 2, // Agressivo: menor diferença necessária (reduzido de 3)
        hotMin: 2, // Agressivo: números ficam "quentes" mais rápido
        sectorMin: 5, // Agressivo: setores detectados com menos hits (reduzido de 6)
        finalsMin: 3, // Agressivo: finales detectadas mais cedo (reduzido de 4)
        clusterArcMax: 10, // Agressivo: clusters maiores aceitos (aumentado de 9)
      }
    : {
        dozenMin: 4, // Normal: mais permissivo (reduzido de 6)
        highlowStreak: 3, // Normal: sequências menores (reduzido de 4)
        parityStreak: 4, // Normal: sequências menores (reduzido de 5)
        rbDiff: 3, // Normal: menor diferença necessária (reduzido de 5)
        hotMin: 3, // Normal: números precisam aparecer menos (reduzido de 4)
        sectorMin: 6, // Normal: setores precisam de menos hits (reduzido de 9)
        finalsMin: 4, // Normal: finales precisam de menos evidência (reduzido de 6)
        clusterArcMax: 8, // Normal: clusters um pouco maiores (aumentado de 7)
      };

  // Trinca por coluna
  const c3 = last10
    .slice(-3)
    .map((r) => rouletteColumn(r.number))
    .filter(Boolean);
  if (c3.length === 3 && c3.every((c) => c === c3[0])) {
    patterns.push({
      key: "column_triple",
      description: `Trinca de coluna ${c3[0]} detectada`,
      risk: "medium",
      targets: { type: "column", column: c3[0] },
    });
  }

  // Desequilíbrio por coluna nos últimos 15
  const col15 = { 1: 0, 2: 0, 3: 0 };
  for (const r of last15) {
    const c = rouletteColumn(r.number);
    if (c) col15[c]++;
  }
  const colMax = Object.entries(col15).sort((a, b) => b[1] - a[1])[0];
  if (colMax && colMax[1] >= Math.max(6, Math.round(T.dozenMin * 0.8))) {
    patterns.push({
      key: "column_imbalance",
      description: `Coluna ${colMax[0]} mais frequente nos últimos 15`,
      risk: "low",
      targets: { type: "column", column: Number(colMax[0]) },
    });
  }

  // Ausência de coluna (coluna "fria")
  const colCounts = { 1: 0, 2: 0, 3: 0 };
  for (const r of last20) {
    const c = rouletteColumn(r.number);
    if (c) colCounts[c]++;
  }
  const colMin = Object.entries(colCounts).sort((a, b) => a[1] - b[1])[0];
  if (colMin && colMin[1] <= 2) {
    // Coluna apareceu 2 vezes ou menos em 20 jogadas
    patterns.push({
      key: "column_cold",
      description: `Coluna ${colMin[0]} ausente (apenas ${colMin[1]} vezes em 20)`,
      risk: "medium",
      targets: { type: "column", column: Number(colMin[0]) },
    });
  }

  // Desequilíbrio por dúzia nos últimos 12
  const d12 = { 1: 0, 2: 0, 3: 0 };
  for (const r of last12) {
    const d = rouletteDozen(r.number);
    if (d) d12[d]++;
  }
  const dMax = Object.entries(d12).sort((a, b) => b[1] - a[1])[0];
  if (dMax && dMax[1] >= T.dozenMin) {
    patterns.push({
      key: "dozen_imbalance",
      description: `Dúzia ${dMax[0]} mais frequente nos últimos 12`,
      risk: "low",
      targets: { type: "dozen", dozen: Number(dMax[0]) },
    });
  }

  // Ausência de dúzia (dúzia "fria")
  const dozenCounts = { 1: 0, 2: 0, 3: 0 };
  for (const r of last18) {
    const d = rouletteDozen(r.number);
    if (d) dozenCounts[d]++;
  }
  const dozenMin = Object.entries(dozenCounts).sort((a, b) => a[1] - b[1])[0];
  if (dozenMin && dozenMin[1] <= 2) {
    // Dúzia apareceu 2 vezes ou menos em 18 jogadas
    patterns.push({
      key: "dozen_cold",
      description: `Dúzia ${dozenMin[0]} ausente (apenas ${dozenMin[1]} vezes em 18)`,
      risk: "medium",
      targets: { type: "dozen", dozen: Number(dozenMin[0]) },
    });
  }

  // Streak High/Low
  const hlSeq = last10
    .slice(-T.highlowStreak)
    .map((r) => rouletteHighLow(r.number))
    .filter(Boolean);
  if (hlSeq.length === T.highlowStreak && hlSeq.every((v) => v === hlSeq[0])) {
    patterns.push({
      key: "highlow_streak",
      description: `Sequência de ${
        hlSeq[0] === "low" ? "baixa (1-18)" : "alta (19-36)"
      } detectada`,
      risk: "medium",
      targets: { type: "highlow", value: hlSeq[0] },
    });
  }

  // Streak paridade
  const pSeq = last10
    .slice(-T.parityStreak)
    .map((r) => rouletteParity(r.number))
    .filter(Boolean);
  if (pSeq.length === T.parityStreak && pSeq.every((v) => v === pSeq[0])) {
    patterns.push({
      key: "parity_streak",
      description: `Sequência de ${
        pSeq[0] === "even" ? "par" : "ímpar"
      } detectada`,
      risk: "medium",
      targets: { type: "parity", value: pSeq[0] },
    });
  }

  // Zero recente - CORRIGIDO: verificar number E color consistentemente
  if (last10.some((r) => r.number === 0 && r.color === "green")) {
    patterns.push({
      key: "zero_proximity",
      description: "Zero (verde) detectado nos últimos 10",
      risk: "high",
      targets: { type: "color", color: "green" },
    });
  }

  // Desequilíbrio vermelho/preto nos últimos 20
  const rr = last20.filter((r) => r.color === "red").length;
  const bb = last20.filter((r) => r.color === "black").length;
  if (Math.abs(rr - bb) >= T.rbDiff) {
    const dominant = rr > bb ? "red" : "black";
    patterns.push({
      key: "red_black_balance",
      description: `Desequilíbrio recente favorece ${
        dominant === "red" ? "vermelho" : "preto"
      }`,
      risk: "low",
      targets: { type: "color", color: dominant },
    });
  }

  // Números dormentes (frios) - números que não saíram há muito tempo
  const last50 = analysisResults.slice(-50);
  const recentNumbers = new Set(
    last50.map((r) => Number(r.number)).filter((n) => Number.isFinite(n))
  );
  const allNumbers = Array.from({ length: 37 }, (_, i) => i); // 0-36
  const dormantNumbers = allNumbers.filter((n) => !recentNumbers.has(n));
  if (dormantNumbers.length >= 8 && dormantNumbers.length <= 15) {
    // Entre 8-15 números dormentes
    // Escolher alguns números dormentes aleatoriamente
    const selectedDormant = dormantNumbers
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(5, dormantNumbers.length));
    patterns.push({
      key: "dormant_numbers",
      description: `${dormantNumbers.length} números dormentes detectados`,
      risk: "high",
      targets: { type: "numbers", numbers: selectedDormant },
    });
  }

  // Números repetidos recentemente
  const last8 = analysisResults.slice(-8);
  const recentFreq = {};
  for (const r of last8) {
    const n = Number(r.number);
    if (Number.isFinite(n)) recentFreq[n] = (recentFreq[n] || 0) + 1;
  }
  const repeatedNumbers = Object.entries(recentFreq)
    .filter(([n, c]) => c >= 2 && Number(n) !== 0)
    .map(([n, c]) => ({ number: Number(n), count: c }))
    .sort((a, b) => b.count - a.count);

  if (repeatedNumbers.length > 0) {
    const topRepeated = repeatedNumbers.slice(0, 3).map((r) => r.number);
    patterns.push({
      key: "repeated_numbers",
      description: `Números repetidos nos últimos 8: ${topRepeated.join(", ")}`,
      risk: "medium",
      targets: { type: "numbers", numbers: topRepeated },
    });
  }

  // Números quentes
  const last30 = analysisResults.slice(-30);
  const freq = {};
  for (const r of last30) {
    const n = Number(r.number);
    if (Number.isFinite(n)) freq[n] = (freq[n] || 0) + 1;
  }
  const hot = Object.entries(freq)
    .filter(([n, c]) => Number(n) !== 0 && c >= T.hotMin)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([n]) => Number(n));
  if (hot.length) {
    patterns.push({
      key: "hot_numbers",
      description: `Números quentes: ${hot.join(", ")}`,
      risk: "medium",
      targets: { type: "numbers", numbers: hot },
    });
  }

  // Vizinhos do último número (Neighbors bet)
  if (analysisResults.length >= 3) {
    const window5 = analysisResults.slice(-5);
    const lastNum = Number(window5[window5.length - 1]?.number);
    if (Number.isFinite(lastNum) && lastNum !== 0) {
      const neigh = neighborsOf(lastNum, 2);
      const prevNums = window5
        .slice(0, -1)
        .map((r) => Number(r.number))
        .filter((n) => Number.isFinite(n));
      const recentHitsInNeighbors = prevNums.filter((n) =>
        neigh.includes(n)
      ).length;
      if (recentHitsInNeighbors >= 2) {
        patterns.push({
          key: "neighbors_last",
          description: `Vizinhos do último número ${lastNum} (concentração recente)`,
          risk: "medium",
          targets: { type: "numbers", numbers: neigh },
        });
      }
    }
  }

  // Número pivô (Pivot number)
  if (analysisResults.length >= 20) {
    const freqPivot = {};
    for (const r of last50) {
      const n = Number(r?.number);
      if (Number.isFinite(n) && n !== 0) freqPivot[n] = (freqPivot[n] || 0) + 1;
    }
    const sortedPivots = Object.entries(freqPivot).sort((a, b) => b[1] - a[1]);
    const topPivot = sortedPivots[0];
    if (topPivot && topPivot[1] >= 3) {
      const pivotNum = Number(topPivot[0]);
      const appearsRecently = analysisResults
        .slice(-12)
        .some((r) => Number(r.number) === pivotNum);
      if (appearsRecently) {
        const neigh = neighborsOf(pivotNum, 2);
        patterns.push({
          key: "pivot_number",
          description: `Número pivô ${pivotNum} frequente (${topPivot[1]}x nos últimos 50)`,
          risk: "medium",
          targets: { type: "numbers", numbers: neigh },
        });
      }
    }
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
    patterns.push({
      key: "sector_voisins",
      description: "Voisins du Zéro frequente nos últimos 24",
      risk: "medium",
      targets: { type: "numbers", numbers: SECTOR_VOISINS },
    });
  if (sectorCounts.tiers >= T.sectorMin)
    patterns.push({
      key: "sector_tiers",
      description: "Tiers du Cylindre frequente nos últimos 24",
      risk: "medium",
      targets: { type: "numbers", numbers: SECTOR_TIERS },
    });
  if (sectorCounts.orphelins >= T.sectorMin)
    patterns.push({
      key: "sector_orphelins",
      description: "Orphelins frequente nos últimos 24",
      risk: "medium",
      targets: { type: "numbers", numbers: SECTOR_ORPHELINS },
    });
  if (sectorCounts.jeu_zero >= Math.max(5, Math.round(T.sectorMin * 0.7)))
    patterns.push({
      key: "sector_jeu_zero",
      description: "Jeu Zéro frequente nos últimos 24",
      risk: "medium",
      targets: { type: "numbers", numbers: SECTOR_JEU_ZERO },
    });

  // Finales (dígitos finais) nos últimos 15
  const finalCounts = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 0,
    9: 0,
  };
  for (const r of last15) {
    const n = Number(r.number);
    if (!Number.isFinite(n)) continue;
    const d = n % 10;
    finalCounts[d]++;
  }
  const finalsNumbers = {
    0: [0, 10, 20, 30],
    1: [1, 11, 21, 31],
    2: [2, 12, 22, 32],
    3: [3, 13, 23, 33],
    4: [4, 14, 24, 34],
    5: [5, 15, 25, 35],
    6: [6, 16, 26, 36],
    7: [7, 17, 27],
    8: [8, 18, 28],
    9: [9, 19, 29],
  };
  const finalsSorted = Object.entries(finalCounts).sort((a, b) => b[1] - a[1]);
  const topFinal = finalsSorted[0];
  if (topFinal && topFinal[1] >= T.finalsMin) {
    const d = Number(topFinal[0]);
    patterns.push({
      key: `final_digit_${d}`,
      description: `Final ${d} frequente nos últimos 15`,
      risk: "medium",
      targets: { type: "numbers", numbers: finalsNumbers[d] },
    });
  }

  // Cluster de vizinhos na roda com últimos 7 - SIMPLIFICADO
  const last7 = analysisResults.slice(-7);
  const positions = last7
    .map((r) => wheelIndexOf(r.number))
    .filter((p) => p >= 0);
  if (positions.length >= 4) {
    // Reduzido de 5 para 4
    // Verificar se há concentração em um setor específico
    const sectors = {};
    for (const pos of positions) {
      // Dividir a roda em 6 setores de ~6 números cada
      const sector = Math.floor(pos / 6);
      sectors[sector] = (sectors[sector] || 0) + 1;
    }

    // Se algum setor tem 3+ ocorrências, considerar cluster
    const maxSector = Object.entries(sectors).sort((a, b) => b[1] - a[1])[0];

    if (maxSector && maxSector[1] >= 3) {
      const sectorNum = Number(maxSector[0]);
      const sectorStart = sectorNum * 6;
      const centerPos = sectorStart + 3; // Centro do setor
      const centerNum = EU_WHEEL_ORDER[centerPos % EU_WHEEL_ORDER.length];
      const neigh = neighborsOf(centerNum, 2);
      patterns.push({
        key: "neighbors_cluster",
        description: `Cluster na roda detectado (setor ${sectorNum + 1})`,
        risk: "medium",
        targets: { type: "numbers", numbers: neigh },
      });
    }
  }

  // 3) Drift de setor: últimos 12 concentrados em um arco pequeno da roda
  if (analysisResults.length >= 12) {
    const win = analysisResults.slice(-12);
    const idxs = win.map((r) => wheelIndexOf(r.number)).filter((i) => i >= 0);
    if (idxs.length >= 8) {
      const N = EU_WHEEL_ORDER.length;
      // Tentar encontrar o menor arco que contenha pelo menos 5 ocorrências
      let bestArc = null; // {start, len, count}
      for (let start = 0; start < N; start++) {
        for (let len = 5; len <= 7; len++) {
          // arcos pequenos de 5-7 números
          /* removed unused end variable */
          const count = idxs.filter((idx) => {
            const d = (idx - start + N) % N;
            return d >= 0 && d < len;
          }).length;
          if (
            count >= 5 &&
            (!bestArc ||
              len < bestArc.len ||
              (len === bestArc.len && count > bestArc.count))
          ) {
            bestArc = { start, len, count };
          }
        }
      }
      if (bestArc) {
        const centerPos = (bestArc.start + Math.floor(bestArc.len / 2)) % N;
        const centerNum = EU_WHEEL_ORDER[centerPos];
        const neigh = neighborsOf(centerNum, 2);
        patterns.push({
          key: "wheel_cluster_drift",
          description: `Concentração em arco pequeno da roda (len ${bestArc.len}, hits ${bestArc.count})`,
          risk: "medium",
          targets: { type: "numbers", numbers: neigh },
        });
      }
    }
  }

  // Integração dos novos padrões

  // Análise de finais
  const finals = analyzeFinals(analysisResults, T.finalsMin);
  for (const [finalDigit, count] of finals) {
    patterns.push({
      key: `final_digit_${finalDigit}`,
      description: `Dígito final ${finalDigit} detectado ${count} vezes`,
      risk: "low",
      targets: { type: "final", digit: Number(finalDigit) },
    });
  }

  // Análise de setores
  const sectors = analyzeSectors(
    analysisResults,
    {
      voisins: SECTOR_VOISINS,
      tiers: SECTOR_TIERS,
      orphelins: SECTOR_ORPHELINS,
      jeu_zero: SECTOR_JEU_ZERO,
    },
    T.sectorMin
  );
  for (const [sector, count] of sectors) {
    patterns.push({
      key: `sector_${sector}`,
      description: `Setor ${sector} detectado ${count} vezes`,
      risk: "medium",
      targets: { type: "sector", sector },
    });
  }

  // Análise de clusters de vizinhos
  const clusters = analyzeNeighborClusters(analysisResults, T.clusterArcMax);
  if (clusters.length > 0) {
    patterns.push({
      key: "neighbors_cluster",
      description: `Clusters de vizinhos detectados (${clusters.length} clusters)`,
      risk: "medium",
      targets: { type: "clusters", clusters },
    });
  }

  // --- Novos detectores solicitados (cor, alternância, espelhados, irmãos, zero->múltiplos de 10, exclusão de setor, alternância oposta, repetição próxima)

  // 1) Sequência de mesma cor (ex.: 5 vermelhos seguidos)
  const colorWindow = analysisResults.slice(-10);
  const colorSeqLen = 5;
  const lastColors = colorWindow.map((r) => r.color).filter(Boolean);
  if (
    lastColors.length >= colorSeqLen &&
    lastColors
      .slice(-colorSeqLen)
      .every((c) => c === lastColors.slice(-1)[0]) &&
    (lastColors.slice(-1)[0] === "red" || lastColors.slice(-1)[0] === "black")
  ) {
    patterns.push({
      key: "color_streak",
      description: `Sequência de mesma cor detectada: ${lastColors
        .slice(-colorSeqLen)
        .join(", ")}`,
      risk: "medium",
      targets: { type: "color", color: lastColors.slice(-1)[0] },
    });
  }

  // 2) Alternância de cores (ex.: Preto, Vermelho, Preto, Vermelho)
  const altLen = 4;
  const altColors = colorWindow
    .map((r) => r.color)
    .filter((c) => c !== "green");
  if (altColors.length >= altLen) {
    const lastAlt = altColors.slice(-altLen);
    const alternates = lastAlt.every((c, i, arr) => {
      if (i === 0) return true;
      return c !== arr[i - 1];
    });
    if (alternates) {
      patterns.push({
        key: "color_alternation",
        description: `Alternância de cores detectada: ${lastAlt.join(", ")}`,
        risk: "low",
        targets: { type: "pattern", pattern: "color_alternation" },
      });
    }
  }

  // ============================================================================
  // NOVOS PADRÕES: Apostas Externas Populares (Dúzias, Par/Ímpar, Alto/Baixo)
  // ============================================================================

  // 3) Sequência de mesma dúzia (3x seguidas - padrão popular)
  const dozenSeq = last10
    .slice(-3)
    .map((r) => rouletteDozen(r.number))
    .filter(Boolean);
  if (dozenSeq.length === 3 && dozenSeq.every((d) => d === dozenSeq[0])) {
    patterns.push({
      key: "dozen_triple",
      description: `Dúzia ${dozenSeq[0]} caiu 3x seguidas`,
      risk: "medium",
      targets: { type: "dozen", dozen: dozenSeq[0] },
    });
  }

  // 4) Desequilíbrio Par/Ímpar (padrão muito popular em cassinos)
  const last20Parity = analysisResults.slice(-20);
  const evenCount = last20Parity.filter(
    (r) => rouletteParity(r.number) === "even"
  ).length;
  const oddCount = last20Parity.filter(
    (r) => rouletteParity(r.number) === "odd"
  ).length;
  const parityDiff = Math.abs(evenCount - oddCount);
  
  if (parityDiff >= 6) {
    // Diferença de 6+ em 20 jogadas
    const dominant = evenCount > oddCount ? "even" : "odd";
    patterns.push({
      key: "parity_imbalance",
      description: `${
        dominant === "even" ? "Pares" : "Ímpares"
      } dominando: ${
        dominant === "even" ? evenCount : oddCount
      } vs ${dominant === "even" ? oddCount : evenCount}`,
      risk: "low",
      targets: { type: "parity", value: dominant },
    });
  }

  // 5) Sequência de Pares (4+ pares seguidos)
  const paritySeq = last10
    .slice(-4)
    .map((r) => rouletteParity(r.number))
    .filter(Boolean);
  if (paritySeq.length === 4 && paritySeq.every((p) => p === "even")) {
    patterns.push({
      key: "even_streak",
      description: `Sequência de 4+ números PARES`,
      risk: "medium",
      targets: { type: "parity", value: "even" },
    });
  }

  // 6) Sequência de Ímpares (4+ ímpares seguidos)
  if (paritySeq.length === 4 && paritySeq.every((p) => p === "odd")) {
    patterns.push({
      key: "odd_streak",
      description: `Sequência de 4+ números ÍMPARES`,
      risk: "medium",
      targets: { type: "parity", value: "odd" },
    });
  }

  // 7) Desequilíbrio Alto/Baixo (1-18 vs 19-36 - padrão clássico)
  const last20HighLow = analysisResults.slice(-20);
  const highCount = last20HighLow.filter(
    (r) => rouletteHighLow(r.number) === "high"
  ).length;
  const lowCount = last20HighLow.filter(
    (r) => rouletteHighLow(r.number) === "low"
  ).length;
  const highLowDiff = Math.abs(highCount - lowCount);

  if (highLowDiff >= 6) {
    // Diferença de 6+ em 20 jogadas
    const dominant = highCount > lowCount ? "high" : "low";
    patterns.push({
      key: "highlow_imbalance",
      description: `${
        dominant === "high" ? "Altos (19-36)" : "Baixos (1-18)"
      } dominando: ${
        dominant === "high" ? highCount : lowCount
      } vs ${dominant === "high" ? lowCount : highCount}`,
      risk: "low",
      targets: { type: "highlow", value: dominant },
    });
  }

  // 8) Sequência de Altos (4+ altos seguidos: 19-36)
  const highLowSeq = last10
    .slice(-4)
    .map((r) => rouletteHighLow(r.number))
    .filter(Boolean);
  if (highLowSeq.length === 4 && highLowSeq.every((h) => h === "high")) {
    patterns.push({
      key: "high_streak",
      description: `Sequência de 4+ números ALTOS (19-36)`,
      risk: "medium",
      targets: { type: "highlow", value: "high" },
    });
  }

  // 9) Sequência de Baixos (4+ baixos seguidos: 1-18)
  if (highLowSeq.length === 4 && highLowSeq.every((h) => h === "low")) {
    patterns.push({
      key: "low_streak",
      description: `Sequência de 4+ números BAIXOS (1-18)`,
      risk: "medium",
      targets: { type: "highlow", value: "low" },
    });
  }

  // 3) Espelhados (12 -> 21)
  function isMirror(a, b) {
    try {
      const sa = String(Number(a));
      const sb = String(Number(b));
      return sa.split("").reverse().join("") === sb;
    } catch {
      return false;
    }
  }
  for (
    let i = analysisResults.length - 1;
    i >= Math.max(0, analysisResults.length - 12);
    i--
  ) {
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      const a = Number(analysisResults[j].number);
      const b = Number(analysisResults[i].number);
      if (
        Number.isFinite(a) &&
        Number.isFinite(b) &&
        a !== 0 &&
        b !== 0 &&
        isMirror(a, b)
      ) {
        patterns.push({
          key: "mirrored_numbers",
          description: `Números espelhados detectados: ${a} -> ${b}`,
          risk: "low",
          targets: { type: "numbers", numbers: [a, b] },
        });
        i = Math.max(-1, i - 12); // sair do loop externo após detectar um par
        break;
      }
    }
  }

  // 4) Números irmãos (mesmo final aparecem juntos)
  const recentForBro = analysisResults.slice(-10).map((r) => Number(r.number));
  const finalsMap = {};
  recentForBro.forEach((n, idx) => {
    if (!Number.isFinite(n) || n === 0) return;
    const f = n % 10;
    finalsMap[f] = finalsMap[f] || [];
    finalsMap[f].push({ n, idx });
  });
  for (const [f, arr] of Object.entries(finalsMap)) {
    if (arr.length >= 2) {
      patterns.push({
        key: "brother_numbers",
        description: `Números irmãos (final ${f}) detectados: ${arr
          .map((x) => x.n)
          .join(", ")}`,
        risk: "low",
        targets: { type: "final", digit: Number(f) },
      });
      break;
    }
  }

  // 5) Zero seguido de múltiplos de 10 (0 -> 10/20/30)
  for (
    let i = analysisResults.length - 1;
    i >= Math.max(0, analysisResults.length - 8);
    i--
  ) {
    const a = Number(analysisResults[i].number);
    if (a === 0) {
      // olhar próximos 3 resultados (mais recentes que o zero)
      for (
        let j = i + 1;
        j <= Math.min(analysisResults.length - 1, i + 3);
        j++
      ) {
        const b = Number(analysisResults[j]?.number);
        if (Number.isFinite(b) && b !== 0 && b % 10 === 0) {
          patterns.push({
            key: "zero_then_multiple10",
            description: `Zero seguido por múltiplo de 10 (${b}) detectado`,
            risk: "low",
            targets: { type: "numbers", numbers: [0, b] },
          });
          i = -1; // sair
          break;
        }
      }
    }
  }

  // 6) Exclusão de setor (setor sem ocorrências nas últimas N jogadas)
  const sectorLook = analysisResults.slice(-24);
  const sectorHitCounts = { voisins: 0, tiers: 0, orphelins: 0, jeu_zero: 0 };
  for (const r of sectorLook) {
    const n = Number(r.number);
    if (!Number.isFinite(n)) continue;
    if (SECTOR_VOISINS.includes(n)) sectorHitCounts.voisins++;
    if (SECTOR_TIERS.includes(n)) sectorHitCounts.tiers++;
    if (SECTOR_ORPHELINS.includes(n)) sectorHitCounts.orphelins++;
    if (SECTOR_JEU_ZERO.includes(n)) sectorHitCounts.jeu_zero++;
  }
  for (const [k, v] of Object.entries(sectorHitCounts)) {
    if (v === 0) {
      patterns.push({
        key: `sector_exclusion_${k}`,
        description: `Exclusão de setor ${k} detectada (0 ocorrências nas últimas ${sectorLook.length})`,
        risk: "medium",
        targets: { type: "sector", sector: k },
      });
    }
  }

  // 7) Alternância de setores opostos (ex.: posições opostas na roda)
  // Verifica se nos últimos 6 resultados existe alternância entre posições com distância ~N/2
  const last6 = analysisResults.slice(-6);
  if (last6.length >= 4) {
    const idxs = last6.map((r) => wheelIndexOf(r.number)).filter((i) => i >= 0);
    const N = EU_WHEEL_ORDER.length;
    let altOpp = true;
    for (let i = 1; i < idxs.length; i++) {
      const d = Math.abs(idxs[i] - idxs[i - 1]);
      const dist = Math.min(d, N - d);
      if (Math.abs(dist - Math.floor(N / 2)) > 3) {
        altOpp = false;
        break;
      }
    }
    if (altOpp) {
      patterns.push({
        key: "alternating_opposite_sectors",
        description: `Alternância entre setores opostos detectada nos últimos ${last6.length}`,
        risk: "low",
        targets: { type: "pattern", pattern: "alternating_opposite_sectors" },
      });
    }
  }

  // 8) Repetição de número próximo (mesmo número reaparece em até 5 rodadas)
  const look = analysisResults.slice(-12).map((r) => Number(r.number));
  for (let i = look.length - 1; i >= 0; i--) {
    const n = look[i];
    if (!Number.isFinite(n) || n === 0) continue;
    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
      if (look[j] === n) {
        patterns.push({
          key: "quick_repeat",
          description: `Número ${n} repetido dentro de ${i - j} rodadas`,
          risk: "medium",
          targets: { type: "numbers", numbers: [n] },
        });
        i = -1;
        break;
      }
    }
  }

  // --- Padrões adicionais solicitados ---

  // Cobra bet (números específicos formam 'S' no tapete)
  const COBRA_NUMS = [1, 5, 9, 12, 14, 16, 19, 23, 27, 30, 32, 34];
  const last30nums = analysisResults.slice(-30).map((r) => Number(r.number));
  const cobraHits = COBRA_NUMS.filter((n) => last30nums.includes(n)).length;
  if (cobraHits >= 2) {
    patterns.push({
      key: "cobra_bet",
      description: `Padrão Cobra detectado (${cobraHits} dos números do padrão saíram recentemente)`,
      risk: "low",
      targets: { type: "numbers", numbers: COBRA_NUMS },
    });
  }

  // Números sequenciais: se últimos 2 forem consecutivos, sugerir continuação
  const seqWin = analysisResults
    .slice(-3)
    .map((r) => Number(r.number))
    .filter((n) => Number.isFinite(n));
  if (seqWin.length >= 2) {
    const a = seqWin[seqWin.length - 2];
    const b = seqWin[seqWin.length - 1];
    if (b === a + 1) {
      patterns.push({
        key: "sequential_numbers",
        description: `Sequência crescente detectada (${a} -> ${b}), sugerindo ${
          b + 1
        }`,
        risk: "low",
        targets: {
          type: "numbers",
          numbers: [b + 1].filter((n) => n >= 0 && n <= 36),
        },
      });
    } else if (b === a - 1) {
      patterns.push({
        key: "sequential_numbers",
        description: `Sequência decrescente detectada (${a} -> ${b}), sugerindo ${
          b - 1
        }`,
        risk: "low",
        targets: {
          type: "numbers",
          numbers: [b - 1].filter((n) => n >= 0 && n <= 36),
        },
      });
    }
  }

  // Vizinhos do último número (aposta em número + vizinhos diretos)
  if (analysisResults.length >= 1) {
    const lastNum = Number(analysisResults[analysisResults.length - 1].number);
    if (Number.isFinite(lastNum) && lastNum !== 0) {
      const neigh = neighborsOf(lastNum, 2);
      patterns.push({
        key: "neighbors_bet",
        description: `Vizinhos de ${lastNum} (aposta em número + vizinhos)`,
        risk: "low",
        targets: { type: "numbers", numbers: neigh },
      });
    }
  }

  // Múltiplos do último número (se último >1)
  if (analysisResults.length >= 1) {
    const lastN = Number(analysisResults[analysisResults.length - 1].number);
    if (Number.isFinite(lastN) && lastN > 1) {
      const mults = [];
      for (let m = 2; m <= Math.floor(36 / lastN); m++) {
        mults.push(lastN * m);
      }
      if (mults.length > 0) {
        patterns.push({
          key: "multiples_of_last",
          description: `Múltiplos de ${lastN} sugeridos: ${mults.join(", ")}`,
          risk: "low",
          targets: { type: "numbers", numbers: mults },
        });
      }
    }
  }

  // Setor oposto: números no lado oposto da roda ao último número
  if (analysisResults.length >= 1) {
    const lastN2 = Number(analysisResults[analysisResults.length - 1].number);
    if (Number.isFinite(lastN2)) {
      const idx = wheelIndexOf(lastN2);
      if (idx >= 0) {
        const N = EU_WHEEL_ORDER.length;
        const oppIdx = (idx + Math.floor(N / 2)) % N;
        const oppNum = EU_WHEEL_ORDER[oppIdx];
        const oppNeighbors = neighborsOf(oppNum, 2);
        patterns.push({
          key: "opposite_sector",
          description: `Setor oposto de ${lastN2} detectado (centro ${oppNum})`,
          risk: "low",
          targets: { type: "numbers", numbers: oppNeighbors },
        });
      }
    }
  }

  // Análise de números quentes
  const hotNumbers = analyzeHotNumbers(analysisResults, T.hotMin);
  for (const [hotNumber, count] of hotNumbers) {
    patterns.push({
      key: "hot_numbers",
      description: `Número quente ${hotNumber} detectado ${count} vezes`,
      risk: "medium",
      targets: { type: "numbers", numbers: [Number(hotNumber)] },
    });
  }

  return patterns;
}

/**
 * Detecta e retorna APENAS O MELHOR sinal de roleta com sistema inteligente
 * @param {Array} results - Histórico de resultados
 * @param {Object} options - Opções de configuração
 * @returns {Object|null} - Sinal único otimizado ou null
 */
export function detectBestRouletteSignal(results = [], options = {}) {
  // Verificar se pode emitir sinal
  if (!patternLearner.canEmitSignal()) {
    console.log("[PatternLearner] Limite de sinais por minuto atingido");
    return null;
  }

  // Detectar todos os padrões possíveis
  const allPatterns = detectRouletteAdvancedPatterns(results, options);

  console.log(
    `[PatternDetection] ${allPatterns.length} padrões detectados:`,
    allPatterns.map((p) => p.key)
  );

  if (allPatterns.length === 0) {
    console.log("[PatternDetection] Nenhum padrão detectado pela análise");
    return null;
  }

  console.log(
    `[PatternScoring] Calculando confiança para ${allPatterns.length} padrões...`
  );

  // Pontuar cada padrão
  const scoredPatterns = allPatterns.map((pattern) => {
    const basePriority = PATTERN_PRIORITIES[pattern.key] || 1;
    const accuracy = patternLearner.getPatternAccuracy(pattern.key);
    const attempts = patternLearner.getTotalAttempts(pattern.key);

    // Calcular confiança (0-10)
    let confidence = basePriority;

    // Ajustar com base em acurácia histórica (se tiver dados)
    if (attempts >= SIGNAL_CONFIG.LEARNING_THRESHOLD) {
      // Penalizar se accuracy < 55%, bonificar se > 60%
      if (accuracy < SIGNAL_CONFIG.MIN_ACCURACY) {
        confidence *= 0.7; // Reduz 30%
      } else if (accuracy > 60) {
        confidence *= 1.2; // Aumenta 20%
      }
    }

    // Ajustar com base em threshold adaptativo
    const adjustedThreshold = patternLearner.getAdjustedThreshold(
      pattern.key,
      confidence
    );
    confidence = Math.max(1, Math.min(10, adjustedThreshold));

    return {
      ...pattern,
      confidence,
      accuracy: attempts > 0 ? accuracy : null,
      attempts,
    };
  });

  console.log(
    `[PatternScoring] Padrões pontuados:`,
    scoredPatterns.map(
      (p) =>
        `${p.key}(conf:${p.confidence.toFixed(1)}, acc:${
          p.accuracy ? p.accuracy.toFixed(1) : "N/A"
        }%)`
    )
  );

  // Filtrar padrões que podem ser emitidos
  const validPatterns = scoredPatterns.filter((p) =>
    patternLearner.shouldEmitPattern(p.key, p.confidence)
  );

  console.log(
    `[PatternFiltering] ${validPatterns.length} padrões válidos após filtro:`,
    validPatterns.map((p) => `${p.key}(${p.confidence.toFixed(1)})`)
  );

  if (validPatterns.length === 0) {
    console.log(
      "[PatternFiltering] Nenhum padrão passou no filtro de confiança"
    );
    return null;
  }

  // Selecionar o melhor padrão (maior confiança)
  const bestPattern = validPatterns.reduce((best, current) =>
    current.confidence > best.confidence ? current : best
  );

  console.log(
    `[PatternSelection] Melhor padrão: ${
      bestPattern.key
    } com confiança ${bestPattern.confidence.toFixed(1)}`
  );

  // Verificar se atinge confiança mínima
  if (bestPattern.confidence < SIGNAL_CONFIG.MIN_CONFIDENCE) {
    console.log(
      `[PatternSelection] Confiança ${bestPattern.confidence.toFixed(
        1
      )} < mínimo ${SIGNAL_CONFIG.MIN_CONFIDENCE}`
    );
    return null;
  }

  // Extrair números específicos para apostar
  const targets = extractTargetNumbers(bestPattern.targets);

  console.log(`[PatternSelection] Targets extraídos:`, targets);

  if (targets.length === 0) {
    console.log(
      `[PatternSelection] BLOQUEADO: Nenhum número alvo extraído para ${bestPattern.key}`
    );
    console.log(`[PatternSelection] bestPattern.targets:`, bestPattern.targets);
    return null;
  }

  // Calcular cobertura da mesa
  const coverage = `${targets.length}/37`;

  // Calcular ROI esperado (simplificado: payout 36:1 - probabilidade)
  const probability = targets.length / 37;
  const expectedRoi = (36 * probability - 1) * 100;

  // Marcar sinal como emitido
  patternLearner.markSignalEmitted();

  // Construir sinal otimizado
  return {
    type: getSignalType(bestPattern.confidence),
    patternKey: bestPattern.key,
    confidence: Number(bestPattern.confidence.toFixed(1)),
    description: getFriendlyDescription(
      bestPattern.key,
      bestPattern.description
    ),
    targets,
    color: getSignalColor(bestPattern.confidence),
    suggestedBet: {
      type: bestPattern.targets.type || "straight_up",
      numbers: targets,
      coverage,
      expectedRoi:
        expectedRoi > 0
          ? `+${expectedRoi.toFixed(1)}%`
          : `${expectedRoi.toFixed(1)}%`,
    },
    validFor: 3, // Válido pelos próximos 3 giros
    historicalAccuracy:
      bestPattern.attempts > 0 ? Number(bestPattern.accuracy.toFixed(1)) : null,
    isLearning: bestPattern.attempts < SIGNAL_CONFIG.LEARNING_THRESHOLD,
    timestamp: Date.now(),
  };
}

/**
 * Extrai números específicos dos targets do padrão
 */
function extractTargetNumbers(targets) {
  if (!targets) return [];

  const numbers = [];

  switch (targets.type) {
    case "numbers":
      return targets.numbers || [];

    case "color": {
      // Retornar números da cor (red: ímpares de 1-36 exceto verdes, black: pares, green: 0)
      if (targets.color === "red") {
        return [
          1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
        ];
      } else if (targets.color === "black") {
        return [
          2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
        ];
      } else if (targets.color === "green") {
        return [0];
      }
      break;
    }

    case "column": {
      // Coluna 1: 1,4,7..., Coluna 2: 2,5,8..., Coluna 3: 3,6,9...
      const col = targets.column;
      for (let i = col; i <= 36; i += 3) {
        numbers.push(i);
      }
      return numbers;
    }

    case "dozen": {
      // Dúzia 1: 1-12, Dúzia 2: 13-24, Dúzia 3: 25-36
      const start = (targets.dozen - 1) * 12 + 1;
      for (let i = start; i < start + 12; i++) {
        numbers.push(i);
      }
      return numbers;
    }

    case "sector": {
      // Retornar números do setor
      const sectorName = targets.sector;
      if (sectorName === "voisins") return SECTOR_VOISINS;
      if (sectorName === "tiers") return SECTOR_TIERS;
      if (sectorName === "orphelins") return SECTOR_ORPHELINS;
      if (sectorName === "jeu_zero") return SECTOR_JEU_ZERO;
      break;
    }

    case "clusters":
      // Pegar números dos clusters
      if (Array.isArray(targets.clusters)) {
        return targets.clusters.flatMap((c) => {
          // Suporta tanto array simples [1,2,3] quanto objeto {numbers: [1,2,3]}
          return Array.isArray(c) ? c : c.numbers || [];
        });
      }
      break;

    case "highlow":
      if (targets.value === "low") {
        return Array.from({ length: 18 }, (_, i) => i + 1);
      } else {
        return Array.from({ length: 18 }, (_, i) => i + 19);
      }

    case "parity":
      if (targets.value === "even") {
        return Array.from({ length: 18 }, (_, i) => (i + 1) * 2);
      } else {
        return Array.from({ length: 18 }, (_, i) => i * 2 + 1);
      }
  }

  return numbers.filter((n) => n >= 0 && n <= 36);
}

/**
 * Determina o tipo de sinal baseado na confiança
 */
function getSignalType(confidence) {
  if (confidence >= 8.5) return "STRONG_SIGNAL";
  if (confidence >= 7.0) return "MEDIUM_SIGNAL";
  return "WEAK_SIGNAL";
}

/**
 * Retorna a cor do sinal baseado na confiança
 */
function getSignalColor(confidence) {
  if (confidence >= 8.5) return "#00ff00"; // Verde forte
  if (confidence >= 7.5) return "#90ee90"; // Verde claro
  if (confidence >= 7.0) return "#ffff00"; // Amarelo
  return "#ffa500"; // Laranja
}

/**
 * Converte descrições técnicas em linguagem amigável para usuários
 */
function getFriendlyDescription(patternKey, originalDescription) {
  // ============================================================================
  // DESCRIÇÕES APENAS PARA PADRÕES POPULARES E COMPROVADOS
  // Removidos padrões especulativos e de baixa confiabilidade
  // ============================================================================
  const friendlyDescriptions = {
    // Setores clássicos da roleta (mais populares)
    sector_voisins:
      "🔥 Vizinhos do Zero! Aposta clássica em 17 números ao redor do zero.",
    sector_tiers: "🎰 Terço do Cilindro! 12 números no lado oposto do zero.",
    sector_orphelins: "✨ Órfãos! 8 números não cobertos pelos outros setores.",
    neighbors_cluster:
      "🎯 Cluster na roda! Números vizinhos estão caindo muito.",

    // Vizinhança (muito populares)
    neighbors_bet:
      "🎯 Vizinhos do último! Aposte nos números adjacentes na roda.",
    neighbors_last: "🎯 Região quente! Vizinhos do último estão ativos.",

    // Números quentes
    hot_numbers: "🔥 Número quente! Este número está caindo muito.",

    // Colunas e dúzias (apostas populares)
    column_cold: "❄️ Coluna fria! Não cai há muito tempo, hora de voltar.",
    dozen_cold: "❄️ Dúzia ausente! Está atrasada para sair.",
    column_triple: "📊 Coluna em sequência! Mesma coluna caiu 3x seguidas.",
    dozen_triple: "📊 Dúzia em sequência! Mesma dúzia caiu 3x seguidas.",

    // Cores (mais simples e populares)
    red_black_balance: "🔴⚫ Cores desbalanceadas! Uma cor está dominando.",
    color_streak: "🔴⚫ Sequência de cor! Mesma cor caindo muito.",
    
    // Apostas externas - Par/Ímpar
    parity_imbalance: "🔢 Par/Ímpar desbalanceado! Um dos dois está dominando.",
    even_streak: "2️⃣4️⃣6️⃣ Sequência de PARES! Números pares caindo muito.",
    odd_streak: "1️⃣3️⃣5️⃣ Sequência de ÍMPARES! Números ímpares caindo muito.",
    
    // Apostas externas - Alto/Baixo
    highlow_imbalance: "⬆️⬇️ Alto/Baixo desbalanceado! Uma faixa está dominando.",
    high_streak: "⬆️ Sequência de ALTOS (19-36)! Números altos caindo muito.",
    low_streak: "⬇️ Sequência de BAIXOS (1-18)! Números baixos caindo muito.",
  };

  // Verificar se há mapeamento direto
  if (friendlyDescriptions[patternKey]) {
    return friendlyDescriptions[patternKey];
  }

  // Padrões com números finais (final_digit_X)
  if (patternKey.startsWith("final_digit_")) {
    const digit = patternKey.split("_")[2];
    return `🎯 Números terminados em ${digit} estão quentes! Aposte neles.`;
  }

  // Se não houver mapeamento, tentar simplificar a descrição original
  return originalDescription
    .replace("Cluster na roda detectado", "Região da roda está quente")
    .replace("(setor", "- área")
    .replace("frequente nos últimos", "está ativa nos últimos")
    .replace("detectado", "identificado")
    .replace("ausente", "não aparece há muito tempo")
    .replace("mais frequente", "está dominando")
    .replace("Sequência de", "Padrão forte em")
    .replace("Desequilíbrio recente favorece", "Tendência forte para");
}

/**
 * Valida o resultado após um sinal ser emitido
 * @param {Object} signal - Sinal emitido anteriormente
 * @param {number} actualNumber - Número que saiu na roleta
 * @returns {boolean} - true se acertou, false se errou
 */
export function validateSignalOutcome(signal, actualNumber) {
  if (!signal || !signal.targets) return false;

  const hit = signal.targets.includes(actualNumber);

  // Registrar resultado
  recordPatternOutcome(signal.patternKey, hit, signal.targets);

  // Ajustar threshold
  if (hit) {
    patternLearner.adjustThreshold(signal.patternKey, false); // Facilitar próximo
  } else {
    patternLearner.adjustThreshold(signal.patternKey, true); // Dificultar próximo
  }

  return hit;
}

export function adviceFingerprint(advice) {
  if (!advice) return null;
  switch (advice.type) {
    case "color":
      return `color:${advice.color}`;
    case "column":
      return `column:${advice.column}`;
    case "dozen":
      return `dozen:${advice.dozen}`;
    case "highlow":
      return `highlow:${advice.value}`;
    case "parity":
      return `parity:${advice.value}`;
    case "numbers":
      return `numbers:${(Array.isArray(advice.numbers)
        ? advice.numbers
        : []
      ).join("-")}`;
    default:
      return advice.type;
  }
}

/**
 * Escolhe o melhor sinal de aposta baseado nos padrões detectados, usando
 * estratégias de pontuação e randomização para evitar previsibilidade.
 *
 * @param {Array} patterns - Padrões detectados pela função detectRouletteAdvancedPatterns
 * @param {Object} stats - Estatísticas gerais dos resultados
 * @param {Object} streaks - Informações sobre sequências atuais
 * @param {Array} results - Histórico de resultados
 * @param {Object} options - Opções de configuração
 * @param {string} options.strategy - Estratégia: 'balanced', 'aggressive', 'conservative'
 * @param {string} options.lastKey - Chave do último padrão para evitar repetição
 * @param {string} options.lastFingerprint - Fingerprint do último sinal para deduplicação
 * @param {number} options.randomizeTopDelta - Delta para randomização entre top candidatos
 * @returns {Object|null} Sinal de aposta escolhido ou null se nenhum disponível
 *
 * Sistema de pontuação:
 * - Chance base do tipo de aposta (verde: 3%, vermelho/preto: 49%, etc.)
 * - Bônus por nível de risco (high: +15, medium: +10, low: +5)
 * - Penalidades por repetição de padrão ou fingerprint
 * - Randomização entre candidatos com pontuação similar
 */
// Helper functions for color checking
function isRed(number) {
  const redNumbers = [
    1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
  ];
  return redNumbers.includes(Number(number));
}

function isBlack(number) {
  const blackNumbers = [
    2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
  ];
  return blackNumbers.includes(Number(number));
}

// Configurações de qualidade de padrões - valores mais permissivos
const PATTERN_QUALITY_CONFIG = {
  minQualityScore: 1.0,
  minConfidence: 0.2,
  maxSaturationPenalty: 0.2,
  recentSaturationWindow: 10,
};

// Filtro de qualidade de padrões
function evaluatePatternQuality(pattern, results) {
  const quality = {
    score: 0,
    confidence: 0,
    reasons: [],
  };

  // Avaliar força do padrão baseado no tipo
  const patternType = pattern.targets?.type || pattern.type;

  // Adicionar valores padrão de confiança e raridade baseados no risco
  const defaultConfidence =
    pattern.confidence ||
    (pattern.risk === "high" ? 0.7 : pattern.risk === "medium" ? 0.5 : 0.3);
  const defaultRarity =
    pattern.rarity ||
    (pattern.risk === "high" ? 3 : pattern.risk === "medium" ? 2 : 1);

  switch (patternType) {
    case "column":
    case "dozen":
      // Padrões de coluna/dúzia são mais confiáveis
      quality.score += 2.5; // Reduzido de 3
      quality.confidence += 0.3;
      quality.reasons.push("Padrão estrutural forte");
      break;
    case "number":
      // Números específicos precisam de mais validação
      quality.score += 2;
      quality.confidence += 0.25; // Aumentado de 0.2
      quality.reasons.push("Padrão numérico específico");
      break;
    case "color":
      // Cores são menos confiáveis devido à alta frequência
      quality.score += 1.5; // Aumentado de 1
      quality.confidence += 0.15; // Aumentado de 0.1
      quality.reasons.push("Padrão básico de cor");
      break;
    case "highlow":
    case "parity":
      // Padrões de alto/baixo e par/ímpar
      quality.score += 2;
      quality.confidence += 0.2;
      quality.reasons.push("Padrão de distribuição");
      break;
  }

  // Avaliar consistência histórica
  if (defaultConfidence > 0.5) {
    // Reduzido de 0.6
    quality.score += 1.5; // Reduzido de 2
    quality.confidence += 0.2;
    quality.reasons.push("Alta confiança histórica");
  }

  // Avaliar raridade (padrões mais raros são mais valiosos)
  if (defaultRarity > 2) {
    // Reduzido de 3
    quality.score += 1;
    quality.confidence += 0.15;
    quality.reasons.push("Padrão raro detectado");
  }

  // Penalizar se há muitos resultados recentes do mesmo tipo (mais tolerante)
  const recentWindow = results.slice(
    -PATTERN_QUALITY_CONFIG.recentSaturationWindow
  );
  const sameTypeCount = recentWindow.filter((r) => {
    if (patternType === "color") {
      const targetColor = pattern.targets?.color;
      return (
        (targetColor === "red" && isRed(r.number)) ||
        (targetColor === "black" && isBlack(r.number))
      );
    }
    return false;
  }).length;

  if (sameTypeCount >= 4) {
    // Aumentado de 3 para 4
    quality.score -= PATTERN_QUALITY_CONFIG.maxSaturationPenalty;
    quality.confidence -= 0.15; // Reduzido de 0.2
    quality.reasons.push("Saturação recente do padrão");
  }

  return quality;
}

function shouldEmitSignal(
  pattern,
  results,
  minQualityScore = null,
  minConfidence = null
) {
  // Usar configurações mais permissivas por padrão
  const qualityThreshold =
    minQualityScore || PATTERN_QUALITY_CONFIG.minQualityScore;
  const confidenceThreshold =
    minConfidence || PATTERN_QUALITY_CONFIG.minConfidence;

  const quality = evaluatePatternQuality(pattern, results);

  return (
    quality.score >= qualityThreshold &&
    quality.confidence >= confidenceThreshold &&
    quality.reasons.length > 0
  );
}

export function chooseRouletteBetSignal(
  patterns,
  stats,
  streaks,
  results,
  options = {}
) {
  if (!patterns || patterns.length === 0) return null;

  // Verificar cooldown antes de escolher sinal
  if (isSignalCooldownActive()) {
    return null;
  }

  // Filtrar padrões por qualidade usando configurações mais permissivas
  const qualityPatterns = patterns.filter((pattern) =>
    shouldEmitSignal(
      pattern,
      results,
      options.minQualityScore,
      options.minConfidence
    )
  );

  if (qualityPatterns.length === 0) {
    return null; // Nenhum padrão atende aos critérios de qualidade
  }

  const strategy = options.strategy || "balanced";
  const lastKey = options.lastKey || null;
  const lastFingerprint = options.lastFingerprint || null;
  const randomizeTopDelta = Number(options.randomizeTopDelta ?? 5); // Aumentado para maior variação

  const candidates = [];
  for (const p of qualityPatterns) {
    switch (p.key) {
      case "column_triple":
        candidates.push({
          key: "column_triple",
          type: "column",
          column: p.targets.column,
          risk: p.risk,
        });
        break;
      case "column_imbalance":
        candidates.push({
          key: "column_imbalance",
          type: "column",
          column: p.targets.column,
          risk: p.risk,
        });
        break;
      case "column_cold":
        candidates.push({
          key: "column_cold",
          type: "column",
          column: p.targets.column,
          risk: p.risk,
        });
        break;
      case "dozen_imbalance":
        candidates.push({
          key: "dozen_imbalance",
          type: "dozen",
          dozen: p.targets.dozen,
          risk: p.risk,
        });
        break;
      case "dozen_cold":
        candidates.push({
          key: "dozen_cold",
          type: "dozen",
          dozen: p.targets.dozen,
          risk: p.risk,
        });
        break;
      case "highlow_streak":
        candidates.push({
          key: "highlow_streak",
          type: "highlow",
          value: p.targets.value,
          risk: p.risk,
        });
        break;
      case "parity_streak":
        candidates.push({
          key: "parity_streak",
          type: "parity",
          value: p.targets.value,
          risk: p.risk,
        });
        break;
      case "hot_numbers":
        candidates.push({
          key: "hot_numbers",
          type: "numbers",
          numbers: p.targets.numbers,
          risk: p.risk,
        });
        break;
      case "color_streak":
        if (p.targets?.type === "color") {
          candidates.push({
            key: "color_streak",
            type: "color",
            color: p.targets.color,
            risk: p.risk,
          });
        }
        break;
      case "color_alternation": {
        // apostar na cor oposta ao último resultado (heurística simples)
        const lastColorAlt = results
          .slice()
          .reverse()
          .find((r) => r.color && r.color !== "green");
        if (lastColorAlt) {
          const opp = lastColorAlt.color === "red" ? "black" : "red";
          candidates.push({
            key: "color_alternation",
            type: "color",
            color: opp,
            risk: p.risk,
          });
        }
        break;
      }
      case "mirrored_numbers":
        if (p.targets?.numbers) {
          candidates.push({
            key: "mirrored_numbers",
            type: "numbers",
            numbers: p.targets.numbers,
            risk: p.risk,
          });
        }
        break;
      case "brother_numbers": {
        // usar os números correspondentes ao dígito final
        if (p.targets?.type === "final") {
          const d = Number(p.targets.digit);
          const finalsNumbersMap = {
            0: [0, 10, 20, 30],
            1: [1, 11, 21, 31],
            2: [2, 12, 22, 32],
            3: [3, 13, 23, 33],
            4: [4, 14, 24, 34],
            5: [5, 15, 25, 35],
            6: [6, 16, 26, 36],
            7: [7, 17, 27],
            8: [8, 18, 28],
            9: [9, 19, 29],
          };
          candidates.push({
            key: "brother_numbers",
            type: "numbers",
            numbers: finalsNumbersMap[d] || [],
            risk: p.risk,
          });
        }
        break;
      }
      case "zero_then_multiple10":
        if (p.targets?.numbers) {
          candidates.push({
            key: "zero_then_multiple10",
            type: "numbers",
            numbers: p.targets.numbers,
            risk: p.risk,
          });
        }
        break;
      case "alternating_opposite_sectors": {
        // tentar mapear para números próximos ao último e seu oposto
        try {
          const last =
            results && results.length
              ? Number(results[results.length - 1].number)
              : null;
          if (Number.isFinite(last)) {
            const idx = wheelIndexOf(last);
            const N = EU_WHEEL_ORDER.length;
            const oppIdx = (idx + Math.floor(N / 2)) % N;
            const center1 = EU_WHEEL_ORDER[idx];
            const center2 = EU_WHEEL_ORDER[oppIdx];
            const nums = Array.from(
              new Set([...neighborsOf(center1, 2), ...neighborsOf(center2, 2)])
            );
            candidates.push({
              key: "alternating_opposite_sectors",
              type: "numbers",
              numbers: nums,
              risk: p.risk,
            });
          }
        } catch (e) {
          void e;
        }
        break;
      }
      case "quick_repeat":
        if (p.targets?.numbers) {
          candidates.push({
            key: "quick_repeat",
            type: "numbers",
            numbers: p.targets.numbers,
            risk: p.risk,
          });
        }
        break;
      case "cobra_bet":
        if (p.targets?.numbers) {
          candidates.push({
            key: "cobra_bet",
            type: "numbers",
            numbers: p.targets.numbers,
            risk: p.risk,
          });
        }
        break;
      case "sequential_numbers":
        if (p.targets?.numbers) {
          candidates.push({
            key: "sequential_numbers",
            type: "numbers",
            numbers: p.targets.numbers,
            risk: p.risk,
          });
        }
        break;
      case "neighbors_bet":
        if (p.targets?.numbers) {
          candidates.push({
            key: "neighbors_bet",
            type: "numbers",
            numbers: p.targets.numbers,
            risk: p.risk,
          });
        }
        break;
      case "multiples_of_last":
        if (p.targets?.numbers) {
          candidates.push({
            key: "multiples_of_last",
            type: "numbers",
            numbers: p.targets.numbers,
            risk: p.risk,
          });
        }
        break;
      case "opposite_sector":
        if (p.targets?.numbers) {
          candidates.push({
            key: "opposite_sector",
            type: "numbers",
            numbers: p.targets.numbers,
            risk: p.risk,
          });
        }
        break;
      case "repeated_numbers":
        candidates.push({
          key: "repeated_numbers",
          type: "numbers",
          numbers: p.targets.numbers,
          risk: p.risk,
        });
        break;
      case "red_black_balance":
        candidates.push({
          key: "red_black_balance",
          type: "color",
          color: p.targets.color,
          risk: p.risk,
        });
        break;
      case "zero_proximity":
        candidates.push({
          key: "zero_proximity",
          type: "color",
          color: "green",
          risk: p.risk,
        });
        break;
      case "sector_voisins":
      case "sector_tiers":
      case "sector_orphelins":
      case "sector_jeu_zero":
      case "neighbors_cluster":
        if (p.targets?.type === "numbers") {
          candidates.push({
            key: p.key,
            type: "numbers",
            numbers: p.targets.numbers,
            risk: p.risk,
          });
        }
        break;
      default:
        if (p.key.startsWith("final_digit_")) {
          // Processar padrões de finais
          const finalsNumbers = {
            0: [0, 10, 20, 30],
            1: [1, 11, 21, 31],
            2: [2, 12, 22, 32],
            3: [3, 13, 23, 33],
            4: [4, 14, 24, 34],
            5: [5, 15, 25, 35],
            6: [6, 16, 26, 36],
            7: [7, 17, 27],
            8: [8, 18, 28],
            9: [9, 19, 29],
          };
          const digit = p.key.replace("final_digit_", "");
          candidates.push({
            key: p.key,
            type: "numbers",
            numbers: finalsNumbers[digit] || [],
            risk: p.risk,
          });
        } else if (p.targets?.type === "numbers") {
          candidates.push({
            key: p.key,
            type: "numbers",
            numbers: p.targets.numbers,
            risk: p.risk,
          });
        }
        break;
    }
  }

  if (candidates.length === 0) return null;

  if (strategy === "priority") {
    const order = [
      "column_triple",
      "column_imbalance",
      "column_cold",
      "dozen_imbalance",
      "dozen_cold",
      "highlow_streak",
      "parity_streak",
      "repeated_numbers",
      "hot_numbers",
      "dormant_numbers",
      "sector_voisins",
      "sector_tiers",
      "sector_orphelins",
      "sector_jeu_zero",
      "neighbors_last",
      "pivot_number",
      "wheel_cluster_drift",
      "neighbors_cluster",
      "final_digit_0",
      "final_digit_1",
      "final_digit_2",
      "final_digit_3",
      "final_digit_4",
      "final_digit_5",
      "final_digit_6",
      "final_digit_7",
      "final_digit_8",
      "final_digit_9",
      "red_black_balance",
      "zero_proximity",
    ];
    const selected = order
      .map((k) => candidates.find((c) => c.key === k))
      .find(Boolean);
    return selected || null;
  }

  // Sistema de pontuação otimizado com múltiplos fatores
  const riskWeight = (r) =>
    r === "low" ? 2 : r === "medium" ? 4 : r === "high" ? 7 : 0;

  const scored = candidates
    .map((advice) => {
      const chance = computeRouletteSignalChance(advice, results);

      // Penalidades por repetição (aumentadas para forçar diversidade)
      const penaltyKey = lastKey && advice.key === lastKey ? 4 : 0;
      const fp = adviceFingerprint(advice);
      const fullFp = `${advice.key || "unknown"}:${fp}`;
      const penaltyFingerprint =
        lastFingerprint && fullFp === lastFingerprint ? 8 : 0;

      // Penalidade especial para vermelho/preto para reduzir dominância
      let colorPenalty = 0;
      if (advice.type === "color" && ["red", "black"].includes(advice.color)) {
        colorPenalty = 3; // Penalidade base para cores simples
        // Penalidade extra se foi usado recentemente
        if (lastKey === "red_black_balance") colorPenalty += 5;
      }

      // Bônus baseado em métricas históricas (se disponível)
      let performanceBonus = 0;
      const patternMetrics = rouletteMetrics.metrics.patterns[advice.key];
      if (patternMetrics && patternMetrics.hits + patternMetrics.misses >= 5) {
        // Bônus/penalidade baseado na taxa de acerto histórica
        const historicalRate = patternMetrics.hitRate;
        if (historicalRate > 0.6) performanceBonus = 8; // Padrão muito bom
        else if (historicalRate > 0.5) performanceBonus = 4; // Padrão bom
        else if (historicalRate > 0.4) performanceBonus = 0; // Padrão neutro
        else performanceBonus = -3; // Padrão ruim
      }

      // Bônus por diversidade de tipos de aposta (aumentados)
      let diversityBonus = 0;
      if (advice.type === "color" && advice.color === "green")
        diversityBonus = 6; // Verde é raro e valioso
      else if (advice.type === "numbers" && advice.numbers?.length <= 8)
        diversityBonus = 5; // Apostas específicas
      else if (advice.type === "column") diversityBonus = 4; // Colunas
      else if (advice.type === "dozen") diversityBonus = 4; // Dúzias
      else if (["highlow", "parity"].includes(advice.type)) diversityBonus = 2; // Apostas simples alternativas

      // Bônus extra para padrões menos comuns
      let rarityBonus = 0;
      if (
        [
          "sector_voisins",
          "sector_tiers",
          "sector_orphelins",
          "sector_jeu_zero",
        ].includes(advice.key)
      ) {
        rarityBonus = 3; // Setores são mais interessantes
      } else if (["dormant_numbers", "repeated_numbers"].includes(advice.key)) {
        rarityBonus = 4; // Números específicos são valiosos
      } else if (["column_cold", "dozen_cold"].includes(advice.key)) {
        rarityBonus = 3; // Padrões de ausência são interessantes
      } else if (["column_imbalance", "column_triple"].includes(advice.key)) {
        rarityBonus = 2; // Padrões de coluna são bons
      } else if (advice.key.startsWith("final_digit_")) {
        rarityBonus = 2; // Finais são estratégias avançadas
      } else if (advice.key === "neighbors_cluster") {
        rarityBonus = 4; // Clusters são raros e valiosos
      }

      // Fator de estratégia
      let strategyMultiplier = 1;
      if (strategy === "aggressive") {
        strategyMultiplier =
          advice.risk === "high" ? 1.4 : advice.risk === "medium" ? 1.2 : 0.8;
      } else if (strategy === "conservative") {
        strategyMultiplier =
          advice.risk === "low" ? 1.1 : advice.risk === "medium" ? 1.0 : 0.7;
      }

      // Cálculo final da pontuação
      const baseScore =
        chance +
        riskWeight(advice.risk) +
        performanceBonus +
        diversityBonus +
        rarityBonus;
      const adjustedScore = baseScore * strategyMultiplier;
      const finalScore =
        adjustedScore - penaltyKey - penaltyFingerprint - colorPenalty;

      return {
        advice,
        chance,
        score: Math.round(finalScore * 10) / 10, // Arredonda para 1 casa decimal
        fullFp,
        breakdown: {
          chance,
          riskWeight: riskWeight(advice.risk),
          performanceBonus,
          diversityBonus,
          rarityBonus,
          strategyMultiplier,
          penaltyKey,
          penaltyFingerprint,
          colorPenalty,
        },
      };
    })
    .sort((a, b) => b.score - a.score);

  const topScore = scored[0].score;
  const nearTop = scored.filter((s) => topScore - s.score <= randomizeTopDelta);
  const pick = nearTop[Math.floor(Math.random() * nearTop.length)] || scored[0];
  const selectedSignal = { ...pick.advice };

  // Normalizar confiança baseada no intervalo de scores
  const scores = scored.map((s) => s.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  let confidence = 1;
  if (maxScore > minScore) {
    confidence = (pick.score - minScore) / (maxScore - minScore);
  }
  // calibrar para 0.2..0.98 para evitar extremos
  confidence = Math.max(0.02, Math.min(0.98, confidence));

  // anexar metadados
  selectedSignal.confidence = Math.round(confidence * 100) / 100;
  selectedSignal._score = pick.score;

  // Ativar cooldown após escolher sinal
  // NOTE: cooldown/logging moved to the caller (UI) to avoid reserving cooldown
  // for signals that may be rejected later by higher-level policies.

  return selectedSignal;
}

/**
 * Calcula a chance estimada de sucesso para um sinal de aposta específico,
 * baseado no histórico recente e probabilidades teóricas da roleta.
 *
 * @param {Object} advice - Objeto de conselho de aposta
 * @param {string} advice.type - Tipo: 'color', 'column', 'dozen', 'highlow', 'parity', 'numbers'
 * @param {*} advice.value - Valor específico (cor, coluna, etc.)
 * @param {Array} results - Histórico de resultados para análise
 * @returns {number} Chance estimada em porcentagem (3-85%)
 *
 * Cálculo:
 * - Base: probabilidade teórica do tipo de aposta
 * - Bônus: ajustes baseados no histórico recente (máx +20%)
 * - Limites: mínimo 3% (verde), máximo 85%
 *
 * Probabilidades base:
 * - Verde (0): 2.7% (1/37)
 * - Vermelho/Preto: 48.6% (18/37)
 * - Coluna/Dúzia: 32.4% (12/37)
 * - Alto/Baixo, Par/Ímpar: 48.6% (18/37)
 * - Números específicos: baseado na quantidade
 */
export function computeRouletteSignalChance(advice, results) {
  const sample = results.slice(-50); // Analisa últimos 50 resultados
  const s = buildRouletteStats(sample);
  const total = s.total || 0;
  const pct = (n, base) =>
    total >= 10 ? Math.round(((n || 0) / total) * 100) : base;

  let base = 0;
  let bonus = 0;

  switch (advice?.type) {
    case "color": {
      const color = advice.color || "green";
      // CORRIGIDO: Probabilidades base mais precisas
      const baseFallback = color === "green" ? 3 : 49; // Verde: 1/37≈2.7%, Vermelho/Preto: 18/37≈48.6%
      base = pct(s.color[color], baseFallback);
      break;
    }
    case "column": {
      const c = advice.column || 1;
      base = pct(s.columns[c], 32); // 12/37≈32.4%
      // bônus por trinca
      bonus += 8;
      break;
    }
    case "dozen": {
      const d = advice.dozen || 1;
      base = pct(s.dozens[d], 32); // 12/37≈32.4%
      bonus += 6;
      break;
    }
    case "highlow": {
      const v = advice.value || "low";
      base = pct(s.highlow[v], 49); // 18/37≈48.6%
      bonus += 5;
      break;
    }
    case "parity": {
      const v = advice.value || "even";
      base = pct(s.parity[v], 49); // 18/37≈48.6%
      bonus += 4;
      break;
    }
    case "numbers": {
      const arr = Array.isArray(advice.numbers) ? advice.numbers : [];
      const sum = arr.reduce((acc, n) => acc + (s.numbers[n] || 0), 0);
      base = pct(sum, Math.max(6, Math.round((arr.length / 37) * 100))); // aproximação
      bonus += Math.min(6, arr.length * 1.5);
      break;
    }
    default:
      base = 10;
  }

  let chance = Math.round(base + bonus);
  chance = Math.max(3, Math.min(85, chance));
  return chance;
}

/**
 * Sistema de métricas de performance para rastrear eficácia dos padões
 */
export class RoulettePatternMetrics {
  constructor() {
    this.metrics = {
      // Contadores por tipo de padrão
      patterns: {},
      // Histórico de acertos/erros
      history: [],
      // Estatísticas agregadas
      stats: {
        totalSignals: 0,
        totalHits: 0,
        totalMisses: 0,
        hitRate: 0,
        bestPattern: null,
        worstPattern: null,
      },
    };
  }

  /**
   * Registra um novo sinal emitido
   */
  recordSignal(patternKey, advice, timestamp = Date.now()) {
    if (!this.metrics.patterns[patternKey]) {
      this.metrics.patterns[patternKey] = {
        signals: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        avgChance: 0,
        totalChance: 0,
      };
    }

    const pattern = this.metrics.patterns[patternKey];
    pattern.signals++;
    this.metrics.stats.totalSignals++;

    // Adiciona ao histórico
    this.metrics.history.push({
      timestamp,
      patternKey,
      advice: { ...advice },
      result: "pending",
    });

    // Mantém apenas últimos 1000 registros
    if (this.metrics.history.length > 1000) {
      this.metrics.history = this.metrics.history.slice(-1000);
    }

    // Retorna o índice do registro recém-adicionado
    const index = this.metrics.history.length - 1;
    return index;
  }

  /**
   * Registra o resultado de um sinal
   */
  recordResult(signalIndex, isHit, actualResult) {
    if (signalIndex < 0 || signalIndex >= this.metrics.history.length) return;

    const signal = this.metrics.history[signalIndex];
    if (signal.result !== "pending") return;

    signal.result = isHit ? "hit" : "miss";
    signal.actualResult = actualResult;

    const pattern = this.metrics.patterns[signal.patternKey];
    if (pattern) {
      if (isHit) {
        pattern.hits++;
        this.metrics.stats.totalHits++;
      } else {
        pattern.misses++;
        this.metrics.stats.totalMisses++;
      }

      pattern.hitRate = pattern.hits / (pattern.hits + pattern.misses);
      this.updateGlobalStats();
    }
  }

  /**
   * Atualiza estatísticas globais
   */
  updateGlobalStats() {
    const total = this.metrics.stats.totalHits + this.metrics.stats.totalMisses;
    this.metrics.stats.hitRate =
      total > 0 ? this.metrics.stats.totalHits / total : 0;

    // Encontra melhor e pior padrão
    let bestRate = -1,
      worstRate = 2;
    let bestPattern = null,
      worstPattern = null;

    for (const [key, pattern] of Object.entries(this.metrics.patterns)) {
      if (pattern.hits + pattern.misses >= 5) {
        // Mínimo 5 tentativas
        if (pattern.hitRate > bestRate) {
          bestRate = pattern.hitRate;
          bestPattern = key;
        }
        if (pattern.hitRate < worstRate) {
          worstRate = pattern.hitRate;
          worstPattern = key;
        }
      }
    }

    this.metrics.stats.bestPattern = bestPattern;
    this.metrics.stats.worstPattern = worstPattern;
  }

  /**
   * Retorna relatório de performance
   */
  getPerformanceReport() {
    return {
      summary: {
        totalSignals: this.metrics.stats.totalSignals,
        totalHits: this.metrics.stats.totalHits,
        totalMisses: this.metrics.stats.totalMisses,
        overallHitRate: Math.round(this.metrics.stats.hitRate * 100),
        bestPattern: this.metrics.stats.bestPattern,
        worstPattern: this.metrics.stats.worstPattern,
      },
      patterns: Object.entries(this.metrics.patterns)
        .filter(([, pattern]) => pattern.signals > 0)
        .map(([key, pattern]) => ({
          pattern: key,
          signals: pattern.signals,
          hits: pattern.hits,
          misses: pattern.misses,
          hitRate: Math.round(pattern.hitRate * 100),
          reliability:
            pattern.hits + pattern.misses >= 10
              ? "high"
              : pattern.hits + pattern.misses >= 5
              ? "medium"
              : "low",
        }))
        .sort((a, b) => b.hitRate - a.hitRate),
    };
  }

  /**
   * Limpa métricas antigas
   */
  reset() {
    this.metrics = {
      patterns: {},
      history: [],
      stats: {
        totalSignals: 0,
        totalHits: 0,
        totalMisses: 0,
        hitRate: 0,
        bestPattern: null,
        worstPattern: null,
      },
    };
  }
}

// Instância global para métricas
export const rouletteMetrics = new RoulettePatternMetrics();

/**
 * Integra métricas de performance no processo de seleção de sinais
 * @param {Object} signal - Sinal selecionado
 * @returns {Object} Sinal com métricas integradas
 */
export function integrateSignalMetrics(signal) {
  if (!signal) return null;

  // Registra o sinal nas métricas
  const signalIndex = rouletteMetrics.recordSignal(signal.key, signal);

  // Adiciona informações de performance ao sinal
  const patternMetrics = rouletteMetrics.metrics.patterns[signal.key];
  const performanceInfo = {
    signalIndex,
    historicalHitRate: patternMetrics
      ? Math.round(patternMetrics.hitRate * 100)
      : null,
    totalSignals: patternMetrics ? patternMetrics.signals : 0,
    confidence:
      typeof signal.chance === "number" ? Math.round(signal.chance) : 50,
  };

  return {
    ...signal,
    performance: performanceInfo,
    timestamp: Date.now(),
  };
}

/**
 * Processa resultado de um sinal para atualizar métricas
 * @param {number} signalIndex - Índice do sinal nas métricas
 * @param {number} actualResult - Resultado real da roleta
 * @param {Object} originalSignal - Sinal original que foi emitido
 */
export function processSignalResult(signalIndex, actualResult, originalSignal) {
  if (typeof signalIndex !== "number" || !originalSignal) return;

  // Determina se o sinal foi um acerto
  let isHit = false;

  switch (originalSignal.type) {
    case "color": {
      const resultColor =
        actualResult === 0
          ? "green"
          : typeof isRed === "function" && isRed(actualResult)
          ? "red"
          : "black";
      isHit = originalSignal.color === resultColor;
      break;
    }
    case "numbers":
      isHit = Array.isArray(originalSignal.numbers)
        ? originalSignal.numbers.includes(actualResult)
        : false;
      break;

    case "column":
      isHit = rouletteColumn(actualResult) === originalSignal.column;
      break;

    case "dozen":
      isHit = rouletteDozen(actualResult) === originalSignal.dozen;
      break;

    case "highlow":
      isHit = rouletteHighLow(actualResult) === originalSignal.value;
      break;

    case "parity":
      isHit = rouletteParity(actualResult) === originalSignal.value;
      break;

    default:
      isHit = false;
  }

  // Registra o resultado nas métricas
  rouletteMetrics.recordResult(signalIndex, isHit, actualResult);
}

export function adviceLabelPt(advice) {
  if (!advice) return "Sem conselho";
  switch (advice.type) {
    case "color":
      return advice.color === "red"
        ? "Vermelho"
        : advice.color === "black"
        ? "Preto"
        : "Verde";
    case "column":
      return `Coluna ${advice.column}`;
    case "dozen":
      return `Dúzia ${advice.dozen}`;
    case "highlow":
      return advice.value === "low" ? "Baixa (1-18)" : "Alta (19-36)";
    case "parity":
      return advice.value === "even" ? "Par" : "Ímpar";
    case "numbers":
      return `Números: ${advice.numbers?.join(", ") || "N/A"}`;
    default:
      return "Desconhecido";
  }
}

// Padrões adicionais para análise de roleta

// Finais: Concentração em dígitos finais
function analyzeFinals(results, minOccurrences = 3) {
  const finals = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  for (const r of results) {
    const num = Number(r.number);
    if (Number.isFinite(num)) {
      const finalDigit = num % 10;
      finals[finalDigit]++;
    }
  }
  return Object.entries(finals).filter(([, count]) => count >= minOccurrences);
}

// Setores da roda: Voisins, Tiers, Orphelins, Jeu Zero
function analyzeSectors(results, sectorMap, minOccurrences = 5) {
  const sectorHits = {};
  for (const sector in sectorMap) {
    sectorHits[sector] = 0;
  }
  for (const r of results) {
    const num = Number(r.number);
    if (Number.isFinite(num)) {
      for (const [sector, numbers] of Object.entries(sectorMap)) {
        if (numbers.includes(num)) {
          sectorHits[sector]++;
        }
      }
    }
  }
  return Object.entries(sectorHits).filter(
    ([, count]) => count >= minOccurrences
  );
}

// Números quentes: Identificação de números frequentes
function analyzeHotNumbers(results, minOccurrences = 3) {
  const numberCounts = {};
  for (const r of results) {
    const num = Number(r.number);
    if (Number.isFinite(num)) {
      numberCounts[num] = (numberCounts[num] || 0) + 1;
    }
  }
  return Object.entries(numberCounts).filter(
    ([, count]) => count >= minOccurrences
  );
}

// Redefinindo a função analyzeNeighborClusters para garantir que seja reconhecida
function analyzeNeighborClusters(results, maxArcSize = 10) {
  const clusters = [];
  for (let i = 0; i < results.length; i++) {
    const num = Number(results[i].number);
    if (!Number.isFinite(num)) continue;

    const neighbors = neighborsOf(num, Math.floor(maxArcSize / 2));
    const cluster = results
      .slice(i, i + neighbors.length)
      .map((r) => Number(r.number));
    if (cluster.every((n) => neighbors.includes(n))) {
      clusters.push(cluster);
    }
  }
  return clusters;
}

// Garantindo que a função seja exportada corretamente
export {
  analyzeFinals,
  analyzeSectors,
  analyzeNeighborClusters,
  analyzeHotNumbers,
};
