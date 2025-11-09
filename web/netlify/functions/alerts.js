/* eslint-env node */
import process from "node:process";
import { MongoClient } from "mongodb";

let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI env var");
  }
  const dbName = process.env.MONGODB_DB || "doubleplay";
  if (!cachedClient) {
    cachedClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    await cachedClient.connect();
  }
  cachedDb = cachedClient.db(dbName);
  return cachedDb;
}

function json(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...extraHeaders,
    },
    body: JSON.stringify(data),
  };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return json(204, { ok: true });
  }

  try {
    const db = await getDb();
    const alertsCol = db.collection("alerts");
    const histCol = db.collection("alerts_history");

    const method = event.httpMethod || "GET";
    const qs = event.queryStringParameters || {};
    const type = qs.type || "current"; // "current" | "history"
    const kind = (qs.kind || "double").toLowerCase(); // future-proof

    if (method === "GET") {
      if (type === "current") {
        const doc = await alertsCol.findOne({ _id: `current_${kind}` });
        return json(200, {
          ok: true,
          signal: doc?.signal || null,
          updatedAt: doc?.updatedAt || null,
        });
      }
      if (type === "history") {
        const limit = Math.min(Number(qs.limit || 20), 100);
        const items = await histCol
          .find({ kind })
          .sort({ updatedAt: -1 })
          .limit(limit)
          .toArray();
        return json(200, { ok: true, items });
      }
      return json(400, { ok: false, error: "invalid type" });
    }

    if (method === "POST") {
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { ok: false, error: "invalid json body" });
      }
      const action = body.action || "set-current";
      const signal = body.signal || null;
      const now = new Date();

      if (action === "set-current") {
        if (!signal || typeof signal !== "object") {
          return json(400, { ok: false, error: "missing signal" });
        }
        await alertsCol.updateOne(
          { _id: `current_${kind}` },
          { $set: { signal, updatedAt: now } },
          { upsert: true }
        );
        // opcional: registrar histórico resumido
        const hist = {
          kind,
          description: signal.description,
          confidence: signal.confidence,
          targets: Array.isArray(signal.targets) ? signal.targets.slice(0, 50) : [],
          updatedAt: now,
        };
        try {
          await histCol.insertOne(hist);
        } catch (e) {
          // não bloquear por falha no histórico
          void e;
        }
        return json(200, { ok: true });
      }

      return json(400, { ok: false, error: "invalid action" });
    }

    return json(405, { ok: false, error: "method not allowed" });
  } catch (e) {
    return json(500, { ok: false, error: e?.message || String(e) });
  }
}

export default handler;