// Buscar últimos resultados do banco de dados
import { connectToDatabase, ensureIndexes } from "./db-utils.js";

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

    const params = event.queryStringParameters || {};
    const gameType = params.gameType || "double";
    // Permitir buscar grandes quantidades para cobrir um dia inteiro
    const cap = 20000; // limite de segurança
    const limit = Math.min(parseInt(params.limit || "5000", 10), cap);

    const resultsCollection = db.collection("results");

    // Buscar últimos resultados
    const results = await resultsCollection
      .find({ gameType })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    // Remover _id e createdAt do MongoDB para facilitar serialização
    const cleanResults = results.map((doc) => {
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
        results: cleanResults.reverse(), // Reverter para ordem cronológica
        count: cleanResults.length,
        gameType,
      }),
    };
  } catch (error) {
    console.error("Erro ao buscar resultados:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Erro ao buscar resultados",
        details: error.message,
      }),
    };
  }
};
