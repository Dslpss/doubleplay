// Configurações de detecção e emissão de sinais do Double
export default {
  // Janelas e thresholds
  seqLen: 5, // sequência mínima para color_streak
  alternationWindow: 4, // tamanho mínimo para alternância
  imbalanceWindow: 20, // janela para red_black_balance
  imbalanceDiff: 3, // diferença mínima entre red e black

  // Qualidade mínima da amostra para emitir sinal
  minSampleTotal: 12,

  // Seleção
  randomizeTopDelta: 5,
  composedMinAgree: 2, // mínimo de padrões concordando para preferir cor

  // Cooldown de emissão (ms)
  cooldownMs: 15000,
};