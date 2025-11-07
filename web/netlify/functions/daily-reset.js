// Função agendada para limpar dados diariamente à meia-noite
import { connectToDatabase, ensureIndexes } from "./db-utils.js";

// Executa diariamente à meia-noite (UTC). Ajuste se precisar de outro fuso.
export const config = {
  schedule: "0 0 * * *",
};

export const handler = async (event) => {
  try {
    const { db } = await connectToDatabase();
    await ensureIndexes(db);

    const resultsCollection = db.collection("results");
    const signalsCollection = db.collection("signals");
    const activeSignalsCollection = db.collection("active_signals");

    const delResults = await resultsCollection.deleteMany({});
    const delSignals = await signalsCollection.deleteMany({});
    const delActive = await activeSignalsCollection.deleteMany({});

    const payload = {
      ok: true,
      message: "Reset diário executado",
      deleted: {
        results: delResults?.deletedCount ?? 0,
        signals: delSignals?.deletedCount ?? 0,
        active_signals: delActive?.deletedCount ?? 0,
      },
      ts: Date.now(),
    };

    // Se invocado via HTTP (para testes), retorna resposta JSON
    if (event && event.httpMethod) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify(payload),
      };
    }

    // Em execução agendada, apenas log (sem resposta HTTP)
    // eslint-disable-next-line no-console
    console.log("[daily-reset]", payload);
    return payload;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[daily-reset] erro:", error);
    const payload = { ok: false, error: error.message };
    if (event && event.httpMethod) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      };
    }
    return payload;
  }
};