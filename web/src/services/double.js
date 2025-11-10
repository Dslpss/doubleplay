// Serviço de sinais inteligentes para Double (0-14)
// 0 -> white, 1-7 -> red, 8-14 -> black
import CONFIG from "./double.config.js";

// Cooldown simples baseado em tempo
let lastSignalTimestamp = 0;
let signalCooldownActive = false;
function setSignalCooldown(ts = Date.now()) {
  lastSignalTimestamp = ts;
  signalCooldownActive = true;
}
export function clearSignalCooldown() {
  signalCooldownActive = false;
  lastSignalTimestamp = 0;
}
function isSignalCooldownActive() {
  if (!signalCooldownActive) return false;
  if (Date.now() - lastSignalTimestamp >= (CONFIG.cooldownMs || 0)) {
    signalCooldownActive = false;
    return false;
  }
  return CONFIG.cooldownMs > 0;
}

// Helpers de cooldown exportados para UI/diagnóstico
export function getCooldownRemainingMs() {
  if (!signalCooldownActive) return 0;
  const elapsed = Date.now() - lastSignalTimestamp;
  const remaining = (CONFIG.cooldownMs || 0) - elapsed;
  return remaining > 0 ? remaining : 0;
}

export { isSignalCooldownActive };

function buildDoubleStats(results = []) {
  const stats = {
    total: 0,
    color: { white: 0, red: 0, black: 0 },
    numbers: {},
  };
  for (const r of results) {
    if (!r) continue;
    stats.total++;
    const c =
      r.color === "white" ? "white" : r.color === "red" ? "red" : "black";
    stats.color[c] = (stats.color[c] || 0) + 1;
    const num = Number(r.number);
    if (Number.isFinite(num))
      stats.numbers[num] = (stats.numbers[num] || 0) + 1;
  }
  return stats;
}

export function computeDoubleSignalChance(advice, results) {
  // Amostra principal para base de probabilidade
  const sample = results.slice(-50);
  const s = buildDoubleStats(sample);
  const total = s.total || 0;
  const pct = (n, base) =>
    total >= 10 ? Math.round(((n || 0) / total) * 100) : base;

  let base = 0;
  let bonus = 0;
  let penalty = 0;

  if (advice?.type === "color") {
    const color = advice.color || "white";
    const baseFallback = color === "white" ? 7 : 47; // White ~6.7%, Red/Black ~46.7%
    // Probabilidade base: para Red/Black, excluir brancos do denominador
    if (color === "white") {
      base = pct(s.color[color], baseFallback);
    } else {
      const nonWhiteTotal = (s.color.red || 0) + (s.color.black || 0);
      base = nonWhiteTotal >= 8
        ? Math.round(((s.color[color] || 0) / nonWhiteTotal) * 100)
        : baseFallback;
    }

    // Contextos auxiliares
    const last5 = results.slice(-5);
    const last5Colors = last5.map((r) => r.color).filter(Boolean);
    const whitesRecent = last5Colors.filter((c) => c === "white").length;

    // Bônus por padrões com intensidade dinâmica
    switch (advice.key) {
      case "color_streak": {
        // comprimento da sequência recente da cor sugerida
        let len = 0;
        for (let i = results.length - 1; i >= 0; i--) {
          const c = results[i]?.color;
          if (!c || c === "white") break;
          if (c === color) len++; else break;
        }
        bonus += Math.min(10, 2 + Math.round(len * 1.2));
        break;
      }
      case "streak_break_opposite": {
        // bônus proporcional ao comprimento da sequência atual da cor oposta
        // ex.: sequência longa de vermelho -> conselho preto
        let oppLen = 0;
        const opp = advice.color === "red" ? "black" : "red";
        for (let i = results.length - 1; i >= 0; i--) {
          const c = results[i]?.color;
          if (!c || c === "white") break;
          if (c === opp) oppLen++; else break;
        }
        bonus += Math.min(9, 2 + Math.round(oppLen * 1.1));
        break;
      }
      case "triple_repeat": {
        bonus += 4;
        break;
      }
      case "red_black_balance": {
        const last20 = results.slice(-CONFIG.imbalanceWindow);
        const s20 = buildDoubleStats(last20);
        const diff = Math.abs((s20.color.red || 0) - (s20.color.black || 0));
        bonus += Math.min(8, 2 + diff);
        break;
      }
      case "two_in_a_row_trend": {
        const last5NonWhite = results
          .slice(-5)
          .map((r) => r.color)
          .filter((c) => c !== "white");
        const support = last5NonWhite.filter((c) => c === color).length;
        bonus += Math.min(7, 2 + support);
        break;
      }
      case "alternation_break": {
        const altWindow = results
          .slice(-Math.max(CONFIG.alternationWindow, 4))
          .map((r) => r.color)
          .filter((c) => c !== "white");
        const altLen = altWindow.length;
        bonus += Math.min(6, 2 + Math.floor(altLen / 2));
        break;
      }
      case "momentum_bias": {
        const last5NonWhite = last5Colors.filter((c) => c !== "white");
        const support = last5NonWhite.filter((c) => c === color).length;
        bonus += Math.min(8, 3 + support); // forte se 4/5 favorecem a cor
        break;
      }
      case "after_white_previous_color": {
        // último foi branco e retomada da cor anterior
        const last = results.slice(-3).map(r => r.color);
        if (last[last.length - 1] === "white") {
          // cor imediatamente anterior
          const prev = last[last.length - 2];
          if (prev && prev === advice.color) bonus += 5;
        }
        break;
      }
      case "hot_zone_last10": {
        const last10 = results
          .slice(-10)
          .map(r => r.color)
          .filter(c => c !== "white");
        const tally = last10.reduce((acc, c) => ((acc[c] = (acc[c]||0)+1), acc), {});
        const cnt = tally[advice.color] || 0;
        // Intensidade cresce com 7/10, 8/10, 9/10...
        bonus += Math.min(8, Math.max(0, cnt - 5));
        break;
      }
      default: {
        bonus += 2;
      }
    }

    // Penalização leve por brancos recentes (ruído)
    if (whitesRecent >= 1) penalty += 2;
    if (last5Colors.slice(-2).includes("white")) penalty += 1;

    // Bônus por proporção na janela 12 (exclui brancos): aumenta confiança sem reduzir alertas
    const last12NonWhite = results
      .slice(-12)
      .map((r) => r.color)
      .filter((c) => c !== "white");
    if (last12NonWhite.length >= 8) {
      const tally12 = last12NonWhite.reduce(
        (acc, c) => ((acc[c] = (acc[c] || 0) + 1), acc),
        {}
      );
      const cnt12 = tally12[color] || 0;
      const pct12 = Math.round((cnt12 / last12NonWhite.length) * 100);
      if (pct12 >= 55) bonus += Math.min(5, Math.floor((pct12 - 50) / 5));
    }
  } else {
    base = 10;
  }

  let chance = Math.round(base + bonus - penalty);
  chance = Math.max(4, Math.min(89, chance));
  return chance;
}

export function detectDoublePatterns(results = []) {
  const patterns = [];
  if (!Array.isArray(results) || results.length < 3) return patterns;

  const last10 = results.slice(-10);
  const colors = last10.map((r) => r.color).filter(Boolean);

  // 1) Sequência de mesma cor (5+)
  const seqLen = 5;
  if (colors.length >= seqLen) {
    const tail = colors.slice(-seqLen);
    if (tail.every((c) => c === tail[0]) && tail[0] !== "white") {
      patterns.push({
        key: "color_streak",
        description: `Sequência de ${tail[0]} detectada: ${tail.join(", ")}`,
        risk: "medium",
        targets: { type: "color", color: tail[0] },
      });
    }
  }

  // 1b) Contra-sequência após streak longo (6+) — padrão popular
  // Se houver uma sequência longa, sugerir quebra apostando na cor oposta
  const lastNonWhite = results
    .slice()
    .reverse()
    .map((r) => r.color)
    .filter((c) => c && c !== "white");
  if (lastNonWhite.length >= 6) {
    let len = 1;
    for (let i = 1; i < lastNonWhite.length; i++) {
      if (lastNonWhite[i] === lastNonWhite[0]) len++; else break;
    }
    if (len >= 6) {
      const streakColor = lastNonWhite[0];
      const opp = streakColor === "red" ? "black" : "red";
      patterns.push({
        key: "streak_break_opposite",
        description: `Sequência longa de ${streakColor} (${len}). Quebra provável: ${opp}.`,
        risk: "medium",
        targets: { type: "color", color: opp },
      });
    }
  }

  // 2) Trinca exata (3 últimas iguais)
  const last3 = results
    .slice(-3)
    .map((r) => r.color)
    .filter(Boolean);
  if (
    last3.length === 3 &&
    last3.every((c) => c === last3[0]) &&
    last3[0] !== "white"
  ) {
    const opp = last3[0] === "red" ? "black" : "red";
    patterns.push({
      key: "triple_repeat",
      description: `Trinca de ${last3[0]} detectada, sugerindo ${opp}`,
      risk: "low",
      targets: { type: "color", color: opp },
    });
  }

  // 3) Desequilíbrio Red/Black nos últimos 20
  const last20 = results.slice(-CONFIG.imbalanceWindow);
  const s20 = buildDoubleStats(last20);
  const diff = Math.abs((s20.color.red || 0) - (s20.color.black || 0));
  if (diff >= CONFIG.imbalanceDiff) {
    const dom = (s20.color.red || 0) > (s20.color.black || 0) ? "red" : "black";
    patterns.push({
      key: "red_black_balance",
      description: `Desequilíbrio recente favorece ${dom} (Δ=${diff})`,
      risk: "low",
      targets: { type: "color", color: dom },
    });
  }

  // 3b) Hot zone: 7+ de 10 últimos (excluindo brancos) favorecem uma cor
  const last10NonWhite = results
    .slice(-10)
    .map((r) => r.color)
    .filter((c) => c !== "white");
  if (last10NonWhite.length >= 7) {
    const tally10 = last10NonWhite.reduce(
      (acc, c) => ((acc[c] = (acc[c] || 0) + 1), acc),
      {}
    );
    const entries10 = Object.entries(tally10).sort((a, b) => b[1] - a[1]);
    if (entries10[0] && entries10[0][1] >= 7) {
      const hot = entries10[0][0];
      patterns.push({
        key: "hot_zone_last10",
        description: `Zona quente: ${entries10[0][1]}/10 favorecem ${hot}`,
        risk: "low",
        targets: { type: "color", color: hot },
      });
    }
  }

  // 4) Alternância de cores prolongada: sugerir quebra (aposte a mesma cor do último)
  const altWindow = results
    .slice(-Math.max(CONFIG.alternationWindow, 4))
    .map((r) => r.color)
    .filter((c) => c !== "white");
  if (altWindow.length >= CONFIG.alternationWindow) {
    const lastAlt = altWindow.slice(-CONFIG.alternationWindow);
    const alternates = lastAlt.every((c, i, arr) =>
      i === 0 ? true : c !== arr[i - 1]
    );
    if (alternates) {
      const suggest = lastAlt[lastAlt.length - 1]; // apostar na continuidade para quebrar alternância
      patterns.push({
        key: "alternation_break",
        description: `Alternância detectada: ${lastAlt.join(
          ", "
        )}. Tendência de quebra em ${suggest}.`,
        risk: "low",
        targets: { type: "color", color: suggest },
      });
    }
  }

  // 5) Dupla sequência: últimos 2 iguais (sem branco) sugerem continuidade
  const last2 = results
    .slice(-2)
    .map((r) => r.color)
    .filter(Boolean);
  const last3Colors = results
    .slice(-3)
    .map((r) => r.color)
    .filter(Boolean);
  if (
    last2.length === 2 &&
    last2[0] === last2[1] &&
    last2[0] !== "white" &&
    !(
      last3Colors.length === 3 && last3Colors.every((c) => c === last3Colors[0])
    )
  ) {
    patterns.push({
      key: "two_in_a_row_trend",
      description: `Dupla de ${last2[0]} detectada. Continuidade provável.`,
      risk: "medium",
      targets: { type: "color", color: last2[0] },
    });
  }

  // 6) Momentum: 4 de 5 últimos (excluindo brancos) favorecem uma cor
  const last5Colors = results
    .slice(-5)
    .map((r) => r.color)
    .filter((c) => c !== "white");
  if (last5Colors.length >= 4) {
    const tally = last5Colors.reduce(
      (acc, c) => ((acc[c] = (acc[c] || 0) + 1), acc),
      {}
    );
    const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (entries[0] && entries[0][1] >= 4) {
      const dom = entries[0][0];
      patterns.push({
        key: "momentum_bias",
        description: `Momentum favorece ${dom} (4/5 recentes)`,
        risk: "low",
        targets: { type: "color", color: dom },
      });
    }
  }

  // 7) Após Branco: retomar a cor anterior (padrão popular)
  const last4 = results.slice(-4).map((r) => r.color);
  if (last4.length >= 2 && last4[last4.length - 1] === "white") {
    const prevColor = last4[last4.length - 2];
    if (prevColor && prevColor !== "white") {
      patterns.push({
        key: "after_white_previous_color",
        description: `Após branco, retomar ${prevColor}`,
        risk: "low",
        targets: { type: "color", color: prevColor },
      });
    }
  }

  return patterns;
}

export function chooseDoubleBetSignal(patterns, results, options = {}) {
  if (!patterns || patterns.length === 0) return null;
  if (isSignalCooldownActive()) return null; // respeitar cooldown
  const lastKey = options.lastKey || null;
  const randomizeTopDelta = Number(
    options.randomizeTopDelta ?? CONFIG.randomizeTopDelta ?? 5
  );
  const preferredColor = options.preferredColor || null;

  const candidates = [];
  for (const p of patterns) {
    if (p.targets?.type === "color" && p.targets.color !== "white") {
      candidates.push({
        key: p.key,
        type: "color",
        color: p.targets.color,
        risk: p.risk,
      });
    }
  }
  if (candidates.length === 0) return null;

  // Preferir cor com consenso (sinal composto)
  const filtered = preferredColor
    ? candidates.filter((c) => c.color === preferredColor)
    : candidates;
  const baseList = filtered.length > 0 ? filtered : candidates;

  // Consenso: quantos padrões favorecem cada cor
  const colorTally = candidates.reduce(
    (acc, c) => ((acc[c.color] = (acc[c.color] || 0) + 1), acc),
    {}
  );

  const scored = baseList
    .map((advice) => {
      const chance = computeDoubleSignalChance(advice, results);
      const penaltyKey = lastKey && advice.key === lastKey ? 4 : 0;
      const riskWeight =
        advice.risk === "low" ? 2 : advice.risk === "medium" ? 4 : 7;
      // Bônus de consenso e pequena penalização por conflito
      const thisCount = colorTally[advice.color] || 0;
      const oppCount = advice.color === "red" ? (colorTally["black"] || 0) : (colorTally["red"] || 0);
      const consensusBoost = Math.min(6, Math.max(0, (thisCount - 1)) * 2);
      const conflictPenalty = Math.min(4, Math.max(0, oppCount - thisCount));
      const score = chance + riskWeight - penaltyKey + consensusBoost - conflictPenalty;
      return { advice, chance, score };
    })
    .sort((a, b) => b.score - a.score);

  const topScore = scored[0].score;
  const nearTop = scored.filter((s) => topScore - s.score <= randomizeTopDelta);
  const pick = nearTop[Math.floor(Math.random() * nearTop.length)] || scored[0];
  const selectedSignal = { ...pick.advice };

  // Normalizar confiança 0-10 a partir de chance %
  const confidence = Math.max(5.8, Math.min(9.6, (pick.chance / 100) * 10));
  selectedSignal.confidence = Math.round(confidence * 10) / 10;
  selectedSignal._score = pick.score;
  selectedSignal.chance = pick.chance;
  return selectedSignal;
}

function getSignalType(confidence) {
  if (confidence >= 8.5) return "STRONG_SIGNAL";
  if (confidence >= 7.0) return "MEDIUM_SIGNAL";
  return "WEAK_SIGNAL";
}

function getSignalColor(confidence) {
  if (confidence >= 8.5) return "#00ff00";
  if (confidence >= 7.5) return "#90ee90";
  if (confidence >= 7.0) return "#ffff00";
  return "#ffa500";
}

export function labelPtForColor(color) {
  return color === "red" ? "Vermelho" : color === "black" ? "Preto" : "Branco";
}

export function numbersForColor(color) {
  // ✅ VALIDAÇÃO: Garantir que sempre retorna array de números (Number)
  if (color === "white") return [0];
  if (color === "red") return [1, 2, 3, 4, 5, 6, 7];
  if (color === "black") return [8, 9, 10, 11, 12, 13, 14];

  // Fallback: se cor inválida, retornar array vazio
  console.warn(`⚠️ [numbersForColor] Cor inválida recebida: ${color}`);
  return [];
}

export function detectBestDoubleSignal(results = [], options = {}) {
  // Qualidade mínima de amostra
  const sampleStats = buildDoubleStats(results.slice(-50));
  if ((sampleStats.total || 0) < (CONFIG.minSampleTotal || 0)) return null;

  const patterns = detectDoublePatterns(results, options);
  if (!patterns || patterns.length === 0) return null;

  const lastKey = options.lastKey || null;
  // Sinal composto: consenso de cor entre padrões
  const agreeColors = patterns
    .filter((p) => p.targets?.type === "color" && p.targets.color !== "white")
    .map((p) => p.targets.color);
  let preferredColor = null;
  if (agreeColors.length >= (CONFIG.composedMinAgree || 2)) {
    const tally = agreeColors.reduce(
      (acc, c) => ((acc[c] = (acc[c] || 0) + 1), acc),
      {}
    );
    const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (entries[0] && entries[0][1] >= (CONFIG.composedMinAgree || 2)) {
      preferredColor = entries[0][0];
    }
  }

  const signalAdvice = chooseDoubleBetSignal(patterns, results, {
    lastKey,
    preferredColor,
  });
  if (!signalAdvice) return null;

  const confidence = signalAdvice.confidence;
  const targets = numbersForColor(signalAdvice.color);

  // ✅ VALIDAÇÃO: Garantir que targets não está vazio
  if (!Array.isArray(targets) || targets.length === 0) {
    console.error(
      `❌ [detectBestDoubleSignal] Targets inválido para cor ${signalAdvice.color}`
    );
    return null;
  }

  // ✅ LOG DE DEBUG: Mostrar targets gerados
  console.log(
    `✅ [detectBestDoubleSignal] Sinal gerado - Cor: ${
      signalAdvice.color
    }, Targets: [${targets.join(", ")}]`
  );

  const descriptionMap = {
    color_streak: "🔴⚫ Sequência de cor ativa!",
    streak_break_opposite: "⛔ Contra-sequência após streak longo",
    triple_repeat: "🔁 Trinca detectada! Aposte na cor oposta.",
    red_black_balance: "📊 Tendência de cor! Uma cor dominando.",
    hot_zone_last10: "🔥 Zona quente: 7/10 favorecem a cor",
    two_in_a_row_trend: "➡️ Continuidade provável após dupla.",
    alternation_break:
      "🔄 Alternância tende a quebrar; aposte na continuidade.",
    momentum_bias: "📈 Momentum recente favorece a cor",
    after_white_previous_color: "⚪ Após branco, retoma cor anterior",
  };

  const description = descriptionMap[signalAdvice.key] || "Padrão detectado";
  const coverage = `${targets.length} números`;
  const expectedRoi =
    targets.length === 1 ? "Alta recompensa" : "Recompensa moderada";

  // Motivos (padrões que concordam com a cor)
  const reasonsKeys = patterns
    .filter(
      (p) =>
        p.targets?.type === "color" && p.targets.color === signalAdvice.color
    )
    .map((p) => p.key);
  const reasons = reasonsKeys.map((k) => descriptionMap[k] || k);

  // Ativar cooldown após gerar um sinal
  if (CONFIG.cooldownMs > 0) setSignalCooldown(Date.now());

  return {
    type: getSignalType(confidence),
    color: getSignalColor(confidence),
    description,
    patternKey: signalAdvice.key,
    confidence,
    suggestedBet: {
      type: "color",
      color: signalAdvice.color,
      numbers: targets,
      coverage,
      expectedRoi,
    },
    targets,
    reasons,
    validFor: 3,
    historicalAccuracy: null,
    isLearning: false,
    timestamp: Date.now(),
  };
}
