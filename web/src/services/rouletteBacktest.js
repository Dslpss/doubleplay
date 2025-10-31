import {
  detectRouletteAdvancedPatterns,
  chooseRouletteBetSignal,
} from "./roulette.js";

/**
 * Simples backtest que percorre um histórico de resultados e simula emissão de sinais
 * - results: array cronológico (mais recente no fim)
 * - detectorOptions: pass-through para detectRouletteAdvancedPatterns
 * - simOptions: { lookbackStartIndex, maxSignals, cooldownRounds }
 */
export function runBacktest(
  results = [],
  detectorOptions = {},
  simOptions = {}
) {
  if (!Array.isArray(results) || results.length < 2) return null;
  const lookbackStartIndex = simOptions.lookbackStartIndex || 50; // começa após 50 resultados
  const cooldownRounds = simOptions.cooldownRounds || 1;

  let signals = [];
  let lastAlertIndex = -Infinity;

  for (let i = lookbackStartIndex; i < results.length - 1; i++) {
    // use history up to i (inclusive)
    const history = results.slice(0, i + 1);
    // reverse chronological expected by detector in app (analysisResults had recent at end)
    const analysisResults = history.slice().reverse();
    const patterns = detectRouletteAdvancedPatterns(
      analysisResults,
      detectorOptions
    );
    if (!patterns || patterns.length === 0) continue;

    const signal = chooseRouletteBetSignal(
      patterns,
      null,
      null,
      analysisResults,
      { strategy: detectorOptions.strategy || "balanced" }
    );
    if (!signal) continue;
    // cooldown em rodadas
    if (i - lastAlertIndex < cooldownRounds) continue;

    // definir o próximo resultado como "resultado do sinal"
    const next = results[i + 1];
    let hit = false;
    // avaliar por tipo
    if (signal.type === "numbers" && Array.isArray(signal.numbers)) {
      hit = signal.numbers.includes(Number(next.number));
    } else if (signal.type === "color") {
      hit = next.color === signal.color;
    } else if (signal.type === "column") {
      // 1..3
      const col =
        Number(next.number) === 0 ? null : ((Number(next.number) - 1) % 3) + 1;
      hit = col === signal.column;
    } else if (signal.type === "dozen") {
      const n = Number(next.number);
      const doz = n === 0 ? null : n <= 12 ? 1 : n <= 24 ? 2 : 3;
      hit = doz === signal.dozen;
    } else if (signal.type === "highlow") {
      const n = Number(next.number);
      if (n === 0) hit = false;
      else hit = signal.value === "low" ? n <= 18 : n > 18;
    } else if (signal.type === "parity") {
      const n = Number(next.number);
      if (n === 0) hit = false;
      else hit = signal.value === "even" ? n % 2 === 0 : n % 2 === 1;
    }

    signals.push({
      index: i,
      key: signal.key,
      type: signal.type,
      target:
        signal.numbers ||
        signal.color ||
        signal.column ||
        signal.dozen ||
        signal.value,
      hit,
    });
    if (hit) {
      lastAlertIndex = i;
    } else {
      lastAlertIndex = i; // também aplicar cooldown quando falha
    }
  }

  // sumarizar
  const total = signals.length;
  const hits = signals.filter((s) => s.hit).length;
  const byType = signals.reduce((acc, s) => {
    acc[s.type] = acc[s.type] || { total: 0, hits: 0 };
    acc[s.type].total++;
    if (s.hit) acc[s.type].hits++;
    return acc;
  }, {});

  return {
    total,
    hits,
    hitRate: total > 0 ? hits / total : 0,
    byType,
    signals,
  };
}
