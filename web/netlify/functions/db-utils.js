// Utility para conexão com MongoDB
import { MongoClient } from "mongodb";

let cachedClient = null;
let cachedDb = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // eslint-disable-next-line no-undef
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI não configurado nas variáveis de ambiente");
  }

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  const db = client.db("doubleplay");

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

export async function ensureIndexes(db) {
  // Índices para performance
  const resultsCollection = db.collection("results");
  const signalsCollection = db.collection("signals");

  await resultsCollection.createIndex({ timestamp: -1 });
  await resultsCollection.createIndex({ gameType: 1, timestamp: -1 });
  await signalsCollection.createIndex({ timestamp: -1 });
  await signalsCollection.createIndex({ gameType: 1, timestamp: -1 });
}
