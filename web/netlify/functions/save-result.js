// Salvar resultados no banco de dados
import { connectToDatabase, ensureIndexes } from "./db-utils.js";

export const handler = async (event) => {
  // Apenas POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { db } = await connectToDatabase();
    await ensureIndexes(db);

    const body = JSON.parse(event.body);
    const { result, gameType = "double" } = body;

    if (!result || !result.number || !result.timestamp) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Dados inválidos. Precisa de number e timestamp",
        }),
      };
    }

    const resultsCollection = db.collection("results");

    // Verificar se já existe
    const existing = await resultsCollection.findOne({
      number: result.number,
      timestamp: result.timestamp,
      gameType,
    });

    if (existing) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Resultado já existe",
          id: existing._id,
        }),
      };
    }

    // Inserir novo resultado
    const doc = {
      ...result,
      gameType,
      createdAt: new Date(),
    };

    const insertResult = await resultsCollection.insertOne(doc);

    // Manter apenas últimos 100 resultados por tipo de jogo
    const count = await resultsCollection.countDocuments({ gameType });
    if (count > 100) {
      const toDelete = count - 100;
      const oldestResults = await resultsCollection
        .find({ gameType })
        .sort({ timestamp: 1 })
        .limit(toDelete)
        .toArray();

      const idsToDelete = oldestResults.map((r) => r._id);
      await resultsCollection.deleteMany({ _id: { $in: idsToDelete } });
    }

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Resultado salvo com sucesso",
        id: insertResult.insertedId,
      }),
    };
  } catch (error) {
    console.error("Erro ao salvar resultado:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Erro ao salvar resultado",
        details: error.message,
      }),
    };
  }
};
