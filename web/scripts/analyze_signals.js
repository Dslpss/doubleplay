/* eslint-env node */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadInput(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error("Arquivo não encontrado:", filePath);
    globalThis.process.exit(1);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("Erro ao parsear JSON:", err.message);
    globalThis.process.exit(1);
  }
}

function normalizeSignals(input) {
  // Aceita três formatos comuns:
  // 1) array simples de sinais
  // 2) { doubleSignalsHistory: [...], rouletteSignalsHistory: [...] }
  // 3) { signals: [...] }
  if (Array.isArray(input)) return input;
  if (input == null) return [];
  if (Array.isArray(input.signals)) return input.signals;
  const out = [];
  if (Array.isArray(input.doubleSignalsHistory))
    out.push(...input.doubleSignalsHistory);
  if (Array.isArray(input.rouletteSignalsHistory))
    out.push(...input.rouletteSignalsHistory);
  // Caso o objeto contenha chaves com arrays de sinais (fallback)
  Object.keys(input).forEach((k) => {
    if (Array.isArray(input[k])) {
      const arr = input[k];
      if (
        arr.length > 0 &&
        arr[0] &&
        (arr[0].patternKey || arr[0].description || arr[0].id)
      ) {
        out.push(...arr);
      }
    }
  });
  return out;
}

function keyForSignal(s) {
  return (
    s.patternKey ||
    s.key ||
    (s.description && s.description.split(":")[0]) ||
    "unknown"
  );
}

function analyze(signals) {
  const groups = {};

  signals.forEach((s) => {
    const k = keyForSignal(s);
    if (!groups[k])
      groups[k] = {
        key: k,
        total: 0,
        confidenceSum: 0,
        confidences: [],
        hits: 0,
        hitOnAttemptCounts: { 1: 0, 2: 0, 3: 0 },
        targetsCountSum: 0,
        samples: [],
      };
    const g = groups[k];
    g.total += 1;
    const conf =
      typeof s.confidence === "number"
        ? s.confidence
        : typeof s.confidence === "string"
        ? Number(s.confidence)
        : NaN;
    if (Number.isFinite(conf)) {
      g.confidenceSum += conf;
      g.confidences.push(conf);
    }
    if (Array.isArray(s.targets)) g.targetsCountSum += s.targets.length;
    const hitOn =
      s.hitOnAttempt || (s.hit && s.hitOnAttempt === undefined ? 1 : undefined);
    if (s.hit) g.hits += 1;
    if (typeof hitOn === "number" && hitOn >= 1 && hitOn <= 3) {
      g.hitOnAttemptCounts[hitOn] = (g.hitOnAttemptCounts[hitOn] || 0) + 1;
    }
    g.samples.push(s);
  });

  // Aggregate metrics
  const rows = Object.values(groups).map((g) => {
    const avgConf = g.confidences.length
      ? g.confidenceSum / g.confidences.length
      : null;
    const pct1 = g.total ? (g.hitOnAttemptCounts[1] / g.total) * 100 : 0;
    const pct2 = g.total ? (g.hitOnAttemptCounts[2] / g.total) * 100 : 0;
    const pct3 = g.total ? (g.hitOnAttemptCounts[3] / g.total) * 100 : 0;
    const hitRate = g.total ? (g.hits / g.total) * 100 : 0;
    // EV aproximado por aposta (payout 2x incluindo stake -> lucro unitário em acerto)
    // EV_unit = p*1 + (1-p)*(-1) = 2p - 1, onde p = hitRate/100
    const evPerBet = 2 * (hitRate / 100) - 1;
    const avgTargets = g.total ? g.targetsCountSum / g.total : 0;
    return {
      key: g.key,
      total: g.total,
      hits: g.hits,
      hitRate: Number(hitRate.toFixed(2)),
      evPerBet: Number(evPerBet.toFixed(3)),
      precisionAt1: Number(pct1.toFixed(2)),
      precisionAt2: Number(pct2.toFixed(2)),
      precisionAt3: Number(pct3.toFixed(2)),
      avgConfidence: avgConf === null ? null : Number(avgConf.toFixed(2)),
      avgTargets: Number(avgTargets.toFixed(2)),
    };
  });

  // Sort by total desc, then precision@1 desc
  rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return (b.precisionAt1 || 0) - (a.precisionAt1 || 0);
  });

  return {
    summary: { totalSignals: signals.length, uniquePatterns: rows.length },
    rows,
  };
}

function saveReport(report, outPath) {
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
}

// Entrypoint
(function main() {
  const argv = globalThis.process.argv.slice(2);
  const inputPath =
    argv[0] || path.join(__dirname, "..", "data", "signals_history.json");
  const outPath = argv[1] || path.join(__dirname, "signal_report.json");

  const raw = loadInput(inputPath);
  const signals = normalizeSignals(raw);
  if (!signals || signals.length === 0) {
    console.error("Nenhum sinal encontrado no arquivo fornecido. Saindo.");
    globalThis.process.exit(1);
  }

  const report = analyze(signals);
  saveReport(report, outPath);

  console.log("Relatório gerado:", outPath);
  console.log(`Total sinais processados: ${report.summary.totalSignals}`);
  console.log("Top padrões (ordenado por volume):");
  console.table(report.rows.slice(0, 50));
})();
