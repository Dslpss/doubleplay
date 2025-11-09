/* eslint-env node */
import process from "node:process";
import { MongoClient } from "mongodb";

let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI env var");
  const dbName = process.env.MONGODB_DB || "doubleplay";
  if (!cachedClient) {
    cachedClient = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
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
  if (event.httpMethod === "OPTIONS") return json(204, { ok: true });
  try {
    const db = await getDb();
    const col = db.collection("signals_outcomes");
    // Garantir TTL de 24h baseado em savedAt
    try {
      await col.createIndex({ savedAt: 1 }, { expireAfterSeconds: 86400 });
    } catch (e) { void e; }

    const method = event.httpMethod || "GET";
    const qs = event.queryStringParameters || {};
    const kind = (qs.kind || "double").toLowerCase();

    if (method === "GET") {
      const limit = Math.min(Number(qs.limit || 50), 200);
      const items = await col
        .find({ kind })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
      return json(200, { ok: true, items });
    }

    if (method === "POST") {
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { ok: false, error: "invalid json body" });
      }
      const record = body.record || null;
      const kindBody = (body.kind || kind || "double").toLowerCase();
      if (!record || typeof record !== "object") {
        return json(400, { ok: false, error: "missing record" });
      }
      const doc = {
        kind: kindBody,
        hit: Boolean(record.hit),
        hitOnAttempt: typeof record.hitOnAttempt === "number" ? record.hitOnAttempt : null,
        description: record.description || "",
        confidence: typeof record.confidence === "number" ? record.confidence : null,
        timestamp: Number(record.timestamp || Date.now()),
        targets: Array.isArray(record.targets) ? record.targets.map(Number) : [],
        resultNumber: typeof record.resultNumber === "number" ? record.resultNumber : null,
        attempts: Array.isArray(record.attempts) ? record.attempts.map((a) => ({
          resultNumber: Number(a.resultNumber),
          hit: Boolean(a.hit),
        })) : [],
        savedAt: new Date(),
      };
      await col.insertOne(doc);
      return json(200, { ok: true });
    }

    return json(405, { ok: false, error: "method not allowed" });
  } catch (e) {
    return json(500, { ok: false, error: e?.message || String(e) });
  }
}

export default handler;