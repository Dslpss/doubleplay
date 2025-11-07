// Salvar sinais no banco de dados
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
    const { signal, gameType = "double" } = body;

    if (!signal || !signal.id) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Dados inválidos. Precisa de signal.id",
        }),
      };
    }

    const signalsCollection = db.collection("signals");

    // Verificar se já existe
    const existing = await signalsCollection.findOne({
      id: signal.id,
      gameType,
    });

    if (existing) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Sinal já existe", id: existing._id }),
      };
    }

    // Inserir novo sinal
    const doc = {
      ...signal,
      gameType,
      createdAt: new Date(),
    };

    const insertResult = await signalsCollection.insertOne(doc);

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Sinal salvo com sucesso",
        id: insertResult.insertedId,
      }),
    };
  } catch (error) {
    console.error("Erro ao salvar sinal:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Erro ao salvar sinal",
        details: error.message,
      }),
    };
  }
};
