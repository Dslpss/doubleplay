// Configurações de detecção e emissão de sinais do Double
export default {
  // Janelas e thresholds
  seqLen: 5, // sequência mínima para color_streak
  alternationWindow: 4, // tamanho mínimo para alternância
  imbalanceWindow: 20, // janela para red_black_balance
  imbalanceDiff: 3, // diferença mínima entre red e black

  // Qualidade mínima da amostra para emitir sinal
  minSampleTotal: 18,

  // Seleção
  randomizeTopDelta: 5,
  composedMinAgree: 2, // mínimo de padrões concordando para preferir cor
  // Emissão: exigir probabilidade mínima e confiança mínima
  minChanceToEmit: 54, // chance % mínima para emitir sinal
  minConfidenceToEmit: 7.6, // confiança mínima (0-10)
  // Requisito de vantagem de consenso (cor escolhida deve ter mais padrões que a oposta)
  minConsensusAdvantage: 1,

  // Cooldown de emissão (ms)
  cooldownMs: 12000,
};