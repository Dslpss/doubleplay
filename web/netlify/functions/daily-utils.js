// Utilitários para ciclo diário de dados (stamp de dia e reset à meia-noite)
// Permite configurar fuso horário via variável de ambiente `DATA_TIMEZONE_OFFSET_MINUTES`

/**
 * Retorna o offset de fuso horário em milissegundos baseado em `DATA_TIMEZONE_OFFSET_MINUTES`.
 * Por padrão usa 0 (UTC). Ex.: para Brasília (UTC-3), defina -180.
 */
export function getTzOffsetMs() {
  const raw = process.env.DATA_TIMEZONE_OFFSET_MINUTES;
  const minutes = raw ? parseInt(raw, 10) : 0;
  if (Number.isNaN(minutes)) return 0;
  return minutes * 60 * 1000;
}

/**
 * Calcula stamp do dia (YYYY-MM-DD) a partir de um epoch em ms, aplicando offset.
 */
export function getDayStampFromEpoch(epochMs) {
  const d = new Date(epochMs + getTzOffsetMs());
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Stamp do dia atual (YYYY-MM-DD) com offset.
 */
export function getTodayStamp() {
  return getDayStampFromEpoch(Date.now());
}

/**
 * Reset diário preguiçoso: na primeira chamada após mudar o dia,
 * apaga documentos de dias antigos e atualiza o meta-state.
 * Mantém somente o dia atual.
 */
export async function ensureDailyReset(db) {
  const meta = db.collection("meta");
  const stateKey = { key: "daily_state" };
  const today = getTodayStamp();

  const current = await meta.findOne(stateKey);
  if (current && current.lastDayStamp === today) {
    return; // já está atualizado para hoje
  }

  // Apaga sinais e resultados de dias diferentes do atual
  const signals = db.collection("signals");
  const results = db.collection("results");
  const active = db.collection("active_signals");

  try {
    await signals.deleteMany({ dayStamp: { $ne: today } });
  } catch (e) {
    console.error("Falha ao apagar sinais antigos:", e);
  }
  try {
    await results.deleteMany({ dayStamp: { $ne: today } });
  } catch (e) {
    console.error("Falha ao apagar resultados antigos:", e);
  }
  try {
    // Sinal ativo não deve atravessar dias
    await active.deleteMany({ dayStamp: { $ne: today } });
  } catch (e) {
    // coleção pode não ter dayStamp ainda; como fallback, esvazia
    try { await active.deleteMany({}); } catch {}
  }

  await meta.updateOne(
    stateKey,
    { $set: { lastDayStamp: today, updatedAt: new Date() } },
    { upsert: true }
  );
}