// Buscar últimos resultados do banco de dados (filtro diário)
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

    const resultsCollection = db.collection("results");

    // Buscar últimos resultados somente do dia atual
    const results = await resultsCollection
      .find({ gameType, dayStamp: getTodayStamp() })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    // Remover _id e createdAt do MongoDB
    const clean = results.map((doc) => {
      const { _id, createdAt, dayStamp, ...rest } = doc;
      _id; createdAt; dayStamp; // evitar warnings
      return rest;
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({ results: clean, count: clean.length, gameType }),
    };
  } catch (error) {
    console.error("Erro ao buscar resultados:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erro ao buscar resultados", details: error.message }),
    };
  }
};
