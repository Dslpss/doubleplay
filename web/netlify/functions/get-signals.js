// Buscar histórico de sinais do banco de dados
import { connectToDatabase, ensureIndexes } from "./db-utils.js";
import { ensureDailyReset, getTodayStamp } from "./daily-utils.js";

export const handler = async (event) => {
  // Apenas GET
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { db } = await connectToDatabase();
    await ensureIndexes(db);
    await ensureDailyReset(db);

    const params = event.queryStringParameters || {};
    const gameType = params.gameType || "double";
    const limit = Math.min(parseInt(params.limit || "100", 10), 100);

    const signalsCollection = db.collection("signals");

    // Buscar últimos sinais
    const signals = await signalsCollection
      .find({ gameType, dayStamp: getTodayStamp() })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    // Remover _id e createdAt do MongoDB
    const cleanSignals = signals.map((doc) => {
      // eslint-disable-next-line no-unused-vars
      const { _id, createdAt, ...rest } = doc;
      return rest;
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({
        signals: cleanSignals,
        count: cleanSignals.length,
        gameType,
      }),
    };
  } catch (error) {
    console.error("Erro ao buscar sinais:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Erro ao buscar sinais",
        details: error.message,
      }),
    };
  }
};
