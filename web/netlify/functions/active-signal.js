// Gerenciar sinal ativo no banco de dados
import { connectToDatabase, ensureIndexes } from './db-utils.js';

export const handler = async (event) => {
  const { db } = await connectToDatabase();
  await ensureIndexes(db);

  const activeSignalsCollection = db.collection('active_signals');
  const params = event.queryStringParameters || {};
  const gameType = params.gameType || 'double';

  if (event.httpMethod === 'GET') {
    // Buscar sinal ativo
    try {
      const activeSignal = await activeSignalsCollection.findOne({ gameType });
      
      if (!activeSignal || !activeSignal.signal) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signal: null, gameType }),
        };
      }

      // Verificar se o sinal ainda é válido (não expirou)
      const now = Date.now();
      const signalAge = now - (activeSignal.signal.timestamp || 0);
      const maxAge = 5 * 60 * 1000; // 5 minutos

      if (signalAge > maxAge) {
        // Sinal expirado, remover
        await activeSignalsCollection.deleteOne({ gameType });
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signal: null, gameType }),
        };
      }

      const { _id: _, ...signalData } = activeSignal;
      _ // evita warning de variável não usada
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signalData),
      };
    } catch (error) {
      console.error('Erro ao buscar sinal ativo:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Erro ao buscar sinal ativo' }),
      };
    }
  }

  if (event.httpMethod === 'POST') {
    // Salvar/atualizar sinal ativo
    try {
      const body = JSON.parse(event.body);
      const { signal } = body;

      if (!signal) {
        // Remover sinal ativo (quando null)
        await activeSignalsCollection.deleteOne({ gameType });
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Sinal ativo removido', gameType }),
        };
      }

      // Salvar ou atualizar sinal ativo
      await activeSignalsCollection.updateOne(
        { gameType },
        {
          $set: {
            signal,
            gameType,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Sinal ativo salvo', gameType }),
      };
    } catch (error) {
      console.error('Erro ao salvar sinal ativo:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Erro ao salvar sinal ativo' }),
      };
    }
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ error: 'Method not allowed' }),
  };
};
